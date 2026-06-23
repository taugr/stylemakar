use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelProviderSettings {
    base_url: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
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

async fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
}

#[tauri::command]
async fn list_models(provider: ModelProviderSettings) -> Result<Vec<String>, String> {
    let base_url = normalize_base_url(provider.base_url.as_deref())?;
    let client = http_client().await?;
    let response = client
        .get(format!("{base_url}/models"))
        .send()
        .await
        .map_err(|error| format!("Model discovery failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Model discovery failed with {}.",
            response.status().as_u16()
        ));
    }

    let body = response
        .json::<ModelsResponse>()
        .await
        .map_err(|error| format!("Model discovery returned invalid JSON: {error}"))?;

    Ok(body
        .data
        .unwrap_or_default()
        .into_iter()
        .filter_map(|model| model.id)
        .collect())
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
        .invoke_handler(tauri::generate_handler![list_models, complete_json])
        .run(tauri::generate_context!())
        .expect("error while running StyleMakar");
}
