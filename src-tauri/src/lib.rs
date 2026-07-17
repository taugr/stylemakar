use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelProviderSettings {
    base_url: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderErrorRecord {
    kind: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderCapabilityStatus {
    provider_fingerprint: String,
    endpoint_reachable: bool,
    model_discovery: String,
    selected_model: Option<String>,
    selected_model_available: bool,
    structured_output: String,
    rewrite_ready: bool,
    available_models: Vec<String>,
    checked_at: String,
    error: Option<ProviderErrorRecord>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Option<Vec<ModelRecord>>,
}

#[derive(Debug, Deserialize)]
struct ModelRecord {
    id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Option<Vec<ChatChoice>>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: Option<ChatCompletionMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: Option<String>,
    reasoning_content: Option<String>,
}

fn unix_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn content_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("content-store.json"))
        .map_err(|error| format!("Could not resolve the app-data directory: {error}"))
}

fn load_content_store_file(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let text = fs::read_to_string(path)
        .map_err(|error| format!("Could not read the content store: {error}"))?;

    match serde_json::from_str(&text) {
        Ok(value) => Ok(Some(value)),
        Err(error) => {
            let recovery_path = path.with_file_name(format!(
                "content-store.corrupt-{}.json",
                unix_timestamp_ms()
            ));
            fs::rename(path, &recovery_path).map_err(|rename_error| {
                format!(
                    "Content store is corrupt ({error}) and could not be preserved: {rename_error}"
                )
            })?;
            Err(format!(
                "Content store is corrupt and was preserved at {}.",
                recovery_path.display()
            ))
        }
    }
}

fn save_content_store_file(path: &Path, snapshot: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Content store path has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create the app-data directory: {error}"))?;
    let temporary_path = path.with_extension("json.tmp");
    let backup_path = path.with_extension("json.backup");
    let bytes = serde_json::to_vec_pretty(snapshot)
        .map_err(|error| format!("Could not serialize the content store: {error}"))?;
    let mut temporary = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary_path)
        .map_err(|error| format!("Could not create the temporary content store: {error}"))?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.sync_all())
        .map_err(|error| format!("Could not flush the temporary content store: {error}"))?;

    if path.exists() {
        fs::copy(path, &backup_path)
            .map_err(|error| format!("Could not back up the previous content store: {error}"))?;
    }

    fs::rename(&temporary_path, path)
        .map_err(|error| format!("Could not atomically replace the content store: {error}"))?;
    Ok(())
}

#[tauri::command]
fn load_content_store(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    load_content_store_file(&content_store_path(&app)?)
}

#[tauri::command]
fn save_content_store(app: tauri::AppHandle, snapshot: Value) -> Result<(), String> {
    save_content_store_file(&content_store_path(&app)?, &snapshot)
}

fn normalize_base_url(base_url: Option<&str>) -> Result<String, String> {
    let candidate = base_url
        .unwrap_or("http://localhost:1234/v1")
        .trim()
        .trim_end_matches('/')
        .to_string();

    if !(candidate.starts_with("http://") || candidate.starts_with("https://")) {
        return Err("Provider baseUrl must be an http(s) URL.".to_string());
    }

    Ok(candidate)
}

fn extract_json_object(text: &str) -> Result<Value, String> {
    let trimmed = text.trim();
    let candidate = if let Some(start) = trimmed.find("```") {
        let after_start = &trimmed[start + 3..];
        let after_language = after_start
            .strip_prefix("json")
            .unwrap_or(after_start)
            .trim_start();

        if let Some(end) = after_language.find("```") {
            &after_language[..end]
        } else {
            trimmed
        }
    } else {
        trimmed
    };
    let first_brace = candidate
        .find('{')
        .ok_or_else(|| "Model response did not include a JSON object.".to_string())?;
    let last_brace = candidate
        .rfind('}')
        .ok_or_else(|| "Model response did not include a JSON object.".to_string())?;

    if last_brace <= first_brace {
        return Err("Model response did not include a JSON object.".to_string());
    }

    serde_json::from_str(&candidate[first_brace..=last_brace])
        .map_err(|error| format!("Model response included invalid JSON: {error}"))
}

fn is_embedding_model(model: &str) -> bool {
    let normalized = model.to_lowercase();
    normalized.contains("embedding") || normalized.contains("embed-") || normalized.ends_with("-embed")
}

fn select_available_model(models: &[String], configured: Option<&str>) -> Option<String> {
    if let Some(model) = configured.map(str::trim).filter(|model| !model.is_empty()) {
        return models.iter().find(|candidate| candidate.as_str() == model).cloned();
    }

    models
        .iter()
        .find(|model| model.to_lowercase().contains("gemma-4") && model.to_lowercase().contains("qat"))
        .or_else(|| models.iter().find(|model| model.to_lowercase().contains("gemma-4")))
        .or_else(|| models.first())
        .cloned()
}

fn provider_fingerprint(provider: &ModelProviderSettings, base_url: &str) -> String {
    serde_json::json!({
        "baseUrl": base_url,
        "model": provider.model.as_deref().unwrap_or("").trim(),
        "reasoningEffort": provider.reasoning_effort.as_deref().unwrap_or("none"),
    })
    .to_string()
}

fn error_kind(message: &str) -> String {
    let normalized = message.to_lowercase();

    if normalized.contains("timed out") || normalized.contains("timeout") {
        "timeout"
    } else if normalized.contains("401") || normalized.contains("403") || normalized.contains("authentication") {
        "authentication"
    } else if normalized.contains("429") || normalized.contains("rate limit") {
        "rate-limit"
    } else if normalized.contains("json") {
        "invalid-json"
    } else if normalized.contains("empty completion") {
        "empty-completion"
    } else if normalized.contains("connect") || normalized.contains("discovery failed") {
        "unreachable"
    } else {
        "unknown"
    }
    .to_string()
}

async fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
}

async fn fetch_models(provider: &ModelProviderSettings) -> Result<Vec<String>, String> {
    let base_url = normalize_base_url(provider.base_url.as_deref())?;
    let client = http_client().await?;
    let response = client
        .get(format!("{base_url}/models"))
        .send()
        .await
        .map_err(|error| format!("Provider model discovery failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Provider model discovery failed with {}.",
            response.status().as_u16()
        ));
    }

    let body = response
        .json::<ModelsResponse>()
        .await
        .map_err(|error| format!("Provider model discovery returned invalid JSON: {error}"))?;

    Ok(body
        .data
        .unwrap_or_default()
        .into_iter()
        .filter_map(|model| model.id)
        .filter(|model| !is_embedding_model(model))
        .collect())
}

#[tauri::command]
async fn list_models(provider: ModelProviderSettings) -> Result<Vec<String>, String> {
    fetch_models(&provider).await
}

#[tauri::command]
async fn probe_provider(provider: ModelProviderSettings) -> Result<ProviderCapabilityStatus, String> {
    let base_url = normalize_base_url(provider.base_url.as_deref())?;
    let fingerprint = provider_fingerprint(&provider, &base_url);
    let checked_at = unix_timestamp_ms().to_string();
    let models = match fetch_models(&provider).await {
        Ok(models) => models,
        Err(message) => {
            return Ok(ProviderCapabilityStatus {
                provider_fingerprint: fingerprint,
                endpoint_reachable: false,
                model_discovery: "failed".to_string(),
                selected_model: None,
                selected_model_available: false,
                structured_output: "unverified".to_string(),
                rewrite_ready: false,
                available_models: vec![],
                checked_at,
                error: Some(ProviderErrorRecord { kind: error_kind(&message), message }),
            });
        }
    };
    let selected_model = select_available_model(&models, provider.model.as_deref());

    if selected_model.is_none() {
        let message = provider
            .model
            .as_deref()
            .map(|model| format!("Configured model \"{model}\" is not available from this provider."))
            .unwrap_or_else(|| "No chat model is available. Load a model or enter its exact model ID.".to_string());
        return Ok(ProviderCapabilityStatus {
            provider_fingerprint: fingerprint,
            endpoint_reachable: true,
            model_discovery: "supported".to_string(),
            selected_model: None,
            selected_model_available: false,
            structured_output: "unverified".to_string(),
            rewrite_ready: false,
            available_models: models,
            checked_at,
            error: Some(ProviderErrorRecord { kind: "model-missing".to_string(), message }),
        });
    }

    let selected_model = selected_model.expect("selected model was checked");
    let probe_provider = ModelProviderSettings {
        model: Some(selected_model.clone()),
        ..provider.clone()
    };
    let probe = complete_json(
        vec![
            ChatMessage {
                role: "system".to_string(),
                content: "Return only a valid JSON object matching this schema: {\"status\":\"ok\"}.".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: "Confirm structured JSON support.".to_string(),
            },
        ],
        probe_provider,
    )
    .await;

    match probe {
        Ok(value) if value.get("status").and_then(Value::as_str) == Some("ok") => Ok(ProviderCapabilityStatus {
            provider_fingerprint: fingerprint,
            endpoint_reachable: true,
            model_discovery: "supported".to_string(),
            selected_model: Some(selected_model),
            selected_model_available: true,
            structured_output: "verified".to_string(),
            rewrite_ready: true,
            available_models: models,
            checked_at,
            error: None,
        }),
        Ok(_) => Ok(ProviderCapabilityStatus {
            provider_fingerprint: fingerprint,
            endpoint_reachable: true,
            model_discovery: "supported".to_string(),
            selected_model: Some(selected_model),
            selected_model_available: true,
            structured_output: "failed".to_string(),
            rewrite_ready: false,
            available_models: models,
            checked_at,
            error: Some(ProviderErrorRecord {
                kind: "invalid-json".to_string(),
                message: "Provider returned JSON, but it did not match the required structure.".to_string(),
            }),
        }),
        Err(message) => Ok(ProviderCapabilityStatus {
            provider_fingerprint: fingerprint,
            endpoint_reachable: true,
            model_discovery: "supported".to_string(),
            selected_model: Some(selected_model),
            selected_model_available: true,
            structured_output: "failed".to_string(),
            rewrite_ready: false,
            available_models: models,
            checked_at,
            error: Some(ProviderErrorRecord { kind: error_kind(&message), message }),
        }),
    }
}

#[tauri::command]
async fn complete_json(
    messages: Vec<ChatMessage>,
    provider: ModelProviderSettings,
) -> Result<Value, String> {
    let base_url = normalize_base_url(provider.base_url.as_deref())?;
    let model = provider.model.unwrap_or_else(|| "gemma-4".to_string());
    let client = http_client().await?;
    let mut last_empty = false;

    for attempt in 0..3 {
        let mut request_messages = messages.clone();

        if attempt > 0 {
            request_messages.push(ChatMessage {
                content:
                    "The previous response was empty. Return the requested JSON object only."
                        .to_string(),
                role: "user".to_string(),
            });
        }

        let response = client
            .post(format!("{base_url}/chat/completions"))
            .json(&serde_json::json!({
                "max_tokens": 360,
                "messages": request_messages,
                "model": model,
                "reasoning_effort": provider.reasoning_effort.as_deref().unwrap_or("none"),
                "stream": false,
                "temperature": 0,
            }))
            .send()
            .await
            .map_err(|error| format!("Model completion failed: {error}"))?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let detail = response.text().await.unwrap_or_default();
            return Err(format!("Model completion failed with {status}: {detail}"));
        }

        let body = response
            .json::<ChatCompletionResponse>()
            .await
            .map_err(|error| format!("Model completion returned invalid JSON: {error}"))?;
        let content = body
            .choices
            .and_then(|choices| choices.into_iter().next())
            .and_then(|choice| choice.message)
            .and_then(|message| {
                message
                    .content
                    .filter(|content| !content.trim().is_empty())
                    .or_else(|| {
                        message
                            .reasoning_content
                            .filter(|content| !content.trim().is_empty())
                    })
            });

        if let Some(content) = content {
            return extract_json_object(&content);
        }

        last_empty = true;
    }

    if last_empty {
        Err("Model returned an empty completion.".to_string())
    } else {
        Err("Model completion failed.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_models,
            probe_provider,
            complete_json,
            load_content_store,
            save_content_store
        ])
        .run(tauri::generate_context!())
        .expect("error while running StyleMakar");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_model_must_match_exactly() {
        let models = vec!["google/gemma-4-12b-qat".to_string()];
        assert_eq!(select_available_model(&models, Some("gemma-4")), None);
    }

    #[test]
    fn recommends_qat_and_excludes_embeddings() {
        let models = vec![
            "text-embedding-nomic".to_string(),
            "google/gemma-4-e4b".to_string(),
            "google/gemma-4-12b-qat".to_string(),
        ];
        let chat_models = models.into_iter().filter(|model| !is_embedding_model(model)).collect::<Vec<_>>();
        assert_eq!(
            select_available_model(&chat_models, None),
            Some("google/gemma-4-12b-qat".to_string())
        );
    }

    #[test]
    fn classifies_common_provider_errors() {
        assert_eq!(error_kind("request timed out"), "timeout");
        assert_eq!(error_kind("failed with 401"), "authentication");
        assert_eq!(error_kind("invalid JSON"), "invalid-json");
    }

    #[test]
    fn content_store_writes_atomically_and_preserves_a_backup() {
        let directory = std::env::temp_dir().join(format!(
            "stylemakar-content-store-{}",
            unix_timestamp_ms()
        ));
        let path = directory.join("content-store.json");
        let first = serde_json::json!({ "schemaVersion": 1, "documents": [] });
        let second =
            serde_json::json!({ "schemaVersion": 1, "documents": [{"id":"one"}] });

        save_content_store_file(&path, &first).expect("first write should succeed");
        save_content_store_file(&path, &second).expect("second write should succeed");

        assert_eq!(
            load_content_store_file(&path).expect("store should load"),
            Some(second)
        );
        assert_eq!(
            load_content_store_file(&path.with_extension("json.backup"))
                .expect("backup should load"),
            Some(first)
        );
        fs::remove_dir_all(directory).expect("temporary store should be removable");
    }

    #[test]
    fn corrupt_content_store_is_moved_to_a_recovery_file() {
        let directory = std::env::temp_dir().join(format!(
            "stylemakar-corrupt-store-{}",
            unix_timestamp_ms()
        ));
        fs::create_dir_all(&directory).expect("temporary directory should exist");
        let path = directory.join("content-store.json");
        fs::write(&path, "{not-json").expect("corrupt fixture should be written");

        let error = load_content_store_file(&path).expect_err("corrupt store must fail");
        assert!(error.contains("preserved at"));
        assert!(!path.exists());
        assert!(
            fs::read_dir(&directory)
                .expect("recovery directory should be readable")
                .any(|entry| entry
                    .expect("entry should be readable")
                    .file_name()
                    .to_string_lossy()
                    .starts_with("content-store.corrupt-"))
        );
        fs::remove_dir_all(directory).expect("temporary store should be removable");
    }
}
