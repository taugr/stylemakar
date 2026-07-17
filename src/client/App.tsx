import {
  BarChart3,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  Eye,
  FileText,
  History,
  Info,
  Menu,
  PenLine,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { MouseEvent, ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_VOICE_PROFILE, PROVIDER_PRESETS } from '../shared/defaults';
import {
  capabilityMatchesProvider,
  isLocalProvider,
  providerProfileForKind,
} from '../shared/provider';
import type {
  DocumentRecord,
  ProviderCapabilityStatus,
  ProviderKind,
  ProviderProfile,
  RewriteProgress,
  RewriteVersion,
  StyleProfile,
  VoiceProfileRecord,
} from '../shared/types';
import { checkProviderCapabilities, rewriteDocument } from './api';
import { loadContentStore, saveContentStore } from './contentRepository';
import { seedDocuments } from './sampleData';
import {
  createBlankDocument,
  createAppBackup,
  hasDocumentRecovery,
  loadDocuments,
  loadProvider,
  loadProviderCapability,
  loadVoiceProfiles,
  parseVoiceProfileImport,
  parseAppBackup,
  saveProvider,
  saveProviderCapability,
} from './storage';

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches?.length ?? 0;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

type ProviderUiStatus =
  | 'Checking'
  | 'Ready'
  | 'Needs setup'
  | 'Incompatible'
  | 'Offline';

function modelStatusLabel(status: ProviderUiStatus): string {
  switch (status) {
    case 'Checking':
      return 'Checking provider';
    case 'Ready':
      return 'Provider ready';
    case 'Needs setup':
      return 'Provider needs setup';
    case 'Incompatible':
      return 'Model incompatible';
    case 'Offline':
      return 'Provider offline';
  }
}

function withModelDefaults(
  provider: ProviderProfile,
  model: string,
): ProviderProfile {
  return {
    ...provider,
    model,
    reasoningEffort: model.toLowerCase().includes('gemma-4-12b-qat')
      ? 'none'
      : provider.reasoningEffort,
  };
}

function voiceToStyleProfile(voice: VoiceProfileRecord): StyleProfile {
  return {
    antiRules: [...voice.antiRules],
    description: voice.description,
    id: voice.id,
    name: voice.name,
    rules: [...voice.rules],
  };
}

type MobileSheet = 'checks' | 'compare' | 'documents' | 'examples';
type MobileTab = 'rewrite' | 'source';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function DraftRow(props: {
  active: boolean;
  document: DocumentRecord;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      className={`draft-row ${props.active ? 'draft-row-active' : ''}`}
      onClick={props.onSelect}
      type="button"
    >
      <FileText size={18} />
      <span>
        <strong>{props.document.title}</strong>
        <small>{displayDate(props.document.updatedAt)}</small>
      </span>
      {props.active ? <i aria-hidden="true" /> : null}
    </button>
  );
}

function ExampleSnippet(props: {
  example: string;
  label: string;
}): ReactElement {
  return (
    <blockquote className="example-snippet">
      <span aria-hidden="true">"</span>
      <p>{props.example}</p>
      <cite>{props.label}</cite>
    </blockquote>
  );
}

function ProviderSettingsFields(props: {
  capability?: ProviderCapabilityStatus;
  checking: boolean;
  models: string[];
  onChange: (provider: ProviderProfile) => void;
  onCheck: () => void;
  provider: ProviderProfile;
  status: ProviderUiStatus;
}): ReactElement {
  const modelOptions = [props.provider.model, ...props.models].filter(
    (model, index, all): model is string =>
      Boolean(model) && all.indexOf(model) === index,
  );

  return (
    <div className="provider-settings">
      <div className="advanced-settings">
        <label>
          <span>Provider</span>
          <select
            aria-label="Provider type"
            onChange={(event) =>
              props.onChange(
                providerProfileForKind(
                  event.target.value as ProviderKind,
                  props.provider,
                ),
              )
            }
            value={props.provider.kind}
          >
            {PROVIDER_PRESETS.map((preset) => (
              <option key={preset.kind} value={preset.kind}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Endpoint</span>
          <input
            aria-label="Provider endpoint"
            onChange={(event) =>
              props.onChange({
                ...props.provider,
                baseUrl: event.target.value,
              })
            }
            value={props.provider.baseUrl}
          />
        </label>
        <label>
          <span>Model ID</span>
          <input
            aria-label="Provider model ID"
            list="provider-model-options"
            onChange={(event) =>
              props.onChange({
                ...withModelDefaults(props.provider, event.target.value),
                model: event.target.value || undefined,
              })
            }
            placeholder="Discover automatically"
            value={props.provider.model ?? ''}
          />
          <datalist id="provider-model-options">
            {modelOptions.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
      </div>
      <div
        aria-live="polite"
        className={`provider-diagnostic provider-diagnostic-${props.status.toLowerCase().replace(' ', '-')}`}
      >
        <span className={props.status === 'Ready' ? 'dot' : 'dot checking'} />
        <div>
          <strong>{modelStatusLabel(props.status)}</strong>
          <small>
            {props.capability?.error?.message ??
              (props.status === 'Ready'
                ? `${props.capability?.selectedModel ?? props.provider.model} passed the structured-output check.`
                : 'Choose a provider and model, then run the compatibility check.')}
          </small>
        </div>
        <button disabled={props.checking} onClick={props.onCheck} type="button">
          {props.checking ? 'Checking…' : 'Test provider'}
        </button>
      </div>
      <p
        className={`provider-privacy ${isLocalProvider(props.provider) ? 'provider-privacy-local' : 'provider-privacy-remote'}`}
      >
        {isLocalProvider(props.provider)
          ? 'Local endpoint: source text and examples stay on this device.'
          : 'Remote endpoint: source text and examples are sent over the network. Stylemakar does not store provider credentials.'}
      </p>
    </div>
  );
}

function VoiceManager(props: {
  error?: string;
  onClose: () => void;
  onCreate: () => void;
  onDelete: (voice: VoiceProfileRecord) => void;
  onDuplicate: (voice: VoiceProfileRecord) => void;
  onExport: (voice: VoiceProfileRecord) => void;
  onImport: (text: string, fileName: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (voice: VoiceProfileRecord) => void;
  selected: VoiceProfileRecord;
  voices: VoiceProfileRecord[];
}): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = (): HTMLElement[] =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      ).filter((element) => element.offsetParent !== null);
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.setTimeout(() => previousFocus?.focus(), 0);
    };
  }, []);

  const updateExample = (
    index: number,
    patch: Partial<VoiceProfileRecord['examples'][number]>,
  ): void => {
    props.onUpdate({
      ...props.selected,
      examples: props.selected.examples.map((example, exampleIndex) =>
        exampleIndex === index ? { ...example, ...patch } : example,
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const moveExample = (index: number, offset: number): void => {
    const destination = index + offset;

    if (destination < 0 || destination >= props.selected.examples.length) {
      return;
    }

    const examples = [...props.selected.examples];
    const [example] = examples.splice(index, 1);

    if (!example) {
      return;
    }

    examples.splice(destination, 0, example);
    props.onUpdate({
      ...props.selected,
      examples,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="modal-layer" role="presentation">
      <button
        aria-label="Close voice manager"
        className="modal-backdrop"
        onClick={props.onClose}
        type="button"
      />
      <section
        aria-label="Voice profiles"
        aria-modal="true"
        className="voice-manager"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <span className="pane-kicker">Voice library</span>
            <h2>Edit voices and examples</h2>
          </div>
          <button aria-label="Close voice manager" onClick={props.onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="voice-manager-body">
          <aside>
            <button className="voice-create-button" onClick={props.onCreate}>
              <Plus size={16} /> Create voice
            </button>
            {props.voices.map((voice) => (
              <button
                className={
                  voice.id === props.selected.id ? 'voice-item-active' : ''
                }
                key={voice.id}
                onClick={() => props.onSelect(voice.id)}
              >
                <strong>{voice.name}</strong>
                <small>{voice.examples.length} examples</small>
              </button>
            ))}
          </aside>
          <div className="voice-editor">
            {props.error ? (
              <div className="error-banner" role="alert">
                {props.error}
              </div>
            ) : null}
            <div className="voice-editor-actions">
              <button onClick={() => props.onDuplicate(props.selected)}>
                Duplicate
              </button>
              <button onClick={() => props.onExport(props.selected)}>
                Export JSON
              </button>
              <label>
                Import
                <input
                  accept=".json,.txt,.md,text/plain,application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file) {
                      void file
                        .text()
                        .then((text) => props.onImport(text, file.name));
                    }

                    event.target.value = '';
                  }}
                  type="file"
                />
              </label>
              <button
                disabled={props.selected.isStarter}
                onClick={() => props.onDelete(props.selected)}
              >
                Delete
              </button>
            </div>
            <label>
              <span>Name</span>
              <input
                onChange={(event) =>
                  props.onUpdate({
                    ...props.selected,
                    name: event.target.value,
                    updatedAt: new Date().toISOString(),
                  })
                }
                value={props.selected.name}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                onChange={(event) =>
                  props.onUpdate({
                    ...props.selected,
                    description: event.target.value,
                    updatedAt: new Date().toISOString(),
                  })
                }
                value={props.selected.description}
              />
            </label>
            <div className="voice-rule-grid">
              <label>
                <span>Rules (one per line)</span>
                <textarea
                  onChange={(event) =>
                    props.onUpdate({
                      ...props.selected,
                      rules: event.target.value
                        .split('\n')
                        .map((rule) => rule.trim())
                        .filter(Boolean),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  value={props.selected.rules.join('\n')}
                />
              </label>
              <label>
                <span>Avoid (one per line)</span>
                <textarea
                  onChange={(event) =>
                    props.onUpdate({
                      ...props.selected,
                      antiRules: event.target.value
                        .split('\n')
                        .map((rule) => rule.trim())
                        .filter(Boolean),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  value={props.selected.antiRules.join('\n')}
                />
              </label>
            </div>
            <div className="voice-examples-heading">
              <div>
                <strong>Reference examples</strong>
                <small>These exact examples are sent to the rewrite.</small>
              </div>
              <button
                onClick={() => {
                  const text = window.prompt('Paste a writing example');

                  if (text?.trim()) {
                    props.onUpdate({
                      ...props.selected,
                      examples: [
                        ...props.selected.examples,
                        {
                          createdAt: new Date().toISOString(),
                          id: crypto.randomUUID(),
                          label: `Example ${props.selected.examples.length + 1}`,
                          text: text.trim(),
                        },
                      ],
                      updatedAt: new Date().toISOString(),
                    });
                  }
                }}
              >
                <Plus size={16} /> Add example
              </button>
            </div>
            <div className="voice-example-list">
              {props.selected.examples.map((example, index) => (
                <article key={example.id}>
                  <input
                    aria-label={`Example ${index + 1} label`}
                    onChange={(event) =>
                      updateExample(index, { label: event.target.value })
                    }
                    value={example.label ?? ''}
                  />
                  <textarea
                    aria-label={`Example ${index + 1} text`}
                    onChange={(event) =>
                      updateExample(index, { text: event.target.value })
                    }
                    value={example.text}
                  />
                  <div>
                    <button
                      disabled={index === 0}
                      onClick={() => moveExample(index, -1)}
                    >
                      Move up
                    </button>
                    <button
                      disabled={index === props.selected.examples.length - 1}
                      onClick={() => moveExample(index, 1)}
                    >
                      Move down
                    </button>
                    <button
                      onClick={() =>
                        props.onUpdate({
                          ...props.selected,
                          examples: props.selected.examples.filter(
                            (candidate) => candidate.id !== example.id,
                          ),
                          updatedAt: new Date().toISOString(),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function App(): ReactElement | null {
  const [documents, setDocuments] = useState<DocumentRecord[]>(() =>
    loadDocuments(seedDocuments),
  );
  const [voices, setVoices] = useState<VoiceProfileRecord[]>(() =>
    loadVoiceProfiles(),
  );
  const [activeId, setActiveId] = useState(documents[0]?.id ?? '');
  const [documentSearch, setDocumentSearch] = useState('');
  const [lastDeletedId, setLastDeletedId] = useState<string>();
  const [storageError, setStorageError] = useState<string | undefined>(() =>
    hasDocumentRecovery()
      ? 'A damaged document store was preserved for recovery; starter documents are shown.'
      : undefined,
  );
  const [contentStoreReady, setContentStoreReady] = useState(false);
  const [contentSaveStatus, setContentSaveStatus] = useState<
    'saved' | 'saving' | 'error'
  >('saved');
  const [provider, setProvider] = useState<ProviderProfile>(() =>
    loadProvider(),
  );
  const [models, setModels] = useState<string[]>([]);
  const [capability, setCapability] = useState<
    ProviderCapabilityStatus | undefined
  >(() => {
    const storedProvider = loadProvider();
    return loadProviderCapability(storedProvider);
  });
  const [isCheckingProvider, setIsCheckingProvider] = useState(true);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteProgress, setRewriteProgress] = useState<RewriteProgress>();
  const [error, setError] = useState<string | undefined>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [voiceManagerOpen, setVoiceManagerOpen] = useState(false);
  const [voiceError, setVoiceError] = useState<string | undefined>();
  const [mobileTab, setMobileTab] = useState<MobileTab>('source');
  const [activeSheet, setActiveSheet] = useState<MobileSheet | undefined>();
  const mobileContentRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const providerCheckIdRef = useRef(0);
  const rewriteAbortRef = useRef<AbortController | undefined>(undefined);
  const activeRunRef = useRef<
    { documentId: string; runId: string } | undefined
  >(undefined);

  const visibleDocuments = useMemo(
    () =>
      documents
        .filter((document) => !document.trashedAt)
        .filter((document) =>
          document.title.toLowerCase().includes(documentSearch.toLowerCase()),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [documentSearch, documents],
  );
  const activeDocument = useMemo(
    () =>
      visibleDocuments.find((document) => document.id === activeId) ??
      visibleDocuments[0],
    [activeId, visibleDocuments],
  );
  const activeVoice = useMemo(
    () =>
      voices.find((voice) => voice.id === activeDocument?.voiceProfileId) ??
      voices[0] ??
      DEFAULT_VOICE_PROFILE,
    [activeDocument?.voiceProfileId, voices],
  );
  const activeVersion = useMemo(
    () =>
      activeDocument?.versions?.find(
        (version) => version.id === activeDocument.selectedVersionId,
      ) ?? activeDocument?.versions?.at(-1),
    [activeDocument],
  );
  const sourceWordCount = activeDocument
    ? countWords(activeDocument.originalText)
    : 0;
  const rewrittenWordCount = activeDocument
    ? countWords(activeDocument.rewrittenText)
    : 0;
  const selectedExamples = activeVoice.examples;

  useEffect(() => {
    let mounted = true;

    void loadContentStore(seedDocuments)
      .then((snapshot) => {
        if (!mounted || !snapshot) {
          return;
        }

        setDocuments(snapshot.documents);
        setVoices(snapshot.voices);
        setActiveId(
          snapshot.documents.find((document) => !document.trashedAt)?.id ?? '',
        );
      })
      .catch((loadError) => {
        if (mounted) {
          setStorageError(
            loadError instanceof Error
              ? loadError.message
              : 'Content store could not be loaded.',
          );
        }
      })
      .finally(() => {
        if (mounted) {
          setContentStoreReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!contentStoreReady) {
      return;
    }

    setContentSaveStatus('saving');
    const timeout = window.setTimeout(() => {
      void saveContentStore(documents, voices)
        .then(() => {
          setContentSaveStatus('saved');
          setStorageError(undefined);
          setVoiceError(undefined);
        })
        .catch((saveError) => {
          setContentSaveStatus('error');
          const message =
            saveError instanceof Error
              ? saveError.message
              : 'Content store could not be saved.';
          setStorageError(`Documents could not be saved: ${message}`);
          setVoiceError(message);
        });
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [contentStoreReady, documents, voices]);

  useEffect(() => {
    saveProvider(provider);
  }, [provider]);

  const runProviderCheck = useCallback(
    async (
      candidate: ProviderProfile,
    ): Promise<ProviderCapabilityStatus | undefined> => {
      const checkId = providerCheckIdRef.current + 1;
      providerCheckIdRef.current = checkId;
      setIsCheckingProvider(true);

      try {
        const result = await checkProviderCapabilities(candidate);

        if (providerCheckIdRef.current !== checkId) {
          return undefined;
        }

        setCapability(result);
        setModels(result.availableModels);
        saveProviderCapability(result);

        if (result.rewriteReady) {
          setError(undefined);
        }

        if (!candidate.model && result.selectedModel) {
          setProvider((current) =>
            capabilityMatchesProvider(result, current)
              ? withModelDefaults(current, result.selectedModel as string)
              : current,
          );
        }

        return result;
      } catch (providerError) {
        if (providerCheckIdRef.current === checkId) {
          setCapability(undefined);
          setModels([]);
          setError(
            providerError instanceof Error
              ? providerError.message
              : 'Provider check failed.',
          );
        }

        return undefined;
      } finally {
        if (providerCheckIdRef.current === checkId) {
          setIsCheckingProvider(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void runProviderCheck(provider);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [provider, runProviderCheck]);

  const providerStatus: ProviderUiStatus = isCheckingProvider
    ? 'Checking'
    : !capabilityMatchesProvider(capability, provider)
      ? 'Needs setup'
      : capability.rewriteReady
        ? 'Ready'
        : !capability.endpointReachable
          ? 'Offline'
          : capability.error?.kind === 'model-missing'
            ? 'Needs setup'
            : 'Incompatible';

  useEffect(() => {
    if (!activeSheet) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeMobileSheet();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      ).filter((element) => element.offsetParent !== null);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[
        focusableElements.length - 1
      ] as HTMLElement;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const content = mobileContentRef.current;
    content?.setAttribute('aria-hidden', 'true');
    content?.setAttribute('inert', '');

    window.setTimeout(() => {
      const initialFocusTarget =
        sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      initialFocusTarget?.focus();
    }, 0);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      content?.removeAttribute('aria-hidden');
      content?.removeAttribute('inert');
    };
  }, [activeSheet]);

  if (!activeDocument) {
    return null;
  }

  const updateActiveDocument = (patch: Partial<DocumentRecord>): void => {
    setDocuments((current) =>
      current.map((document) =>
        document.id === activeDocument.id
          ? {
              ...document,
              ...patch,
              title:
                patch.originalText && document.title === 'Untitled Document'
                  ? patch.originalText
                      .trim()
                      .split(/\s+/)
                      .slice(0, 7)
                      .join(' ')
                      .slice(0, 72)
                  : (patch.title ?? document.title),
              updatedAt: new Date().toISOString(),
            }
          : document,
      ),
    );
  };

  const selectVoice = (voiceId: string): void => {
    const voice = voices.find((candidate) => candidate.id === voiceId);

    if (!voice) {
      setVoiceError('That voice profile is no longer available.');
      return;
    }

    updateActiveDocument({
      styleProfile: voiceToStyleProfile(voice),
      voiceProfileId: voice.id,
    });
    setVoiceError(undefined);
  };

  const updateVoice = (voice: VoiceProfileRecord): void => {
    setVoices((current) =>
      current.map((candidate) =>
        candidate.id === voice.id ? voice : candidate,
      ),
    );

    if (activeDocument.voiceProfileId === voice.id) {
      updateActiveDocument({ styleProfile: voiceToStyleProfile(voice) });
    }
  };

  const createVoice = (): void => {
    const now = new Date().toISOString();
    const voice: VoiceProfileRecord = {
      antiRules: [],
      createdAt: now,
      description: 'A custom voice profile.',
      examples: [],
      id: crypto.randomUUID(),
      name: `New voice ${voices.length + 1}`,
      rules: [],
      schemaVersion: 1,
      updatedAt: now,
    };
    setVoices((current) => [...current, voice]);
    updateActiveDocument({
      styleProfile: voiceToStyleProfile(voice),
      voiceProfileId: voice.id,
    });
  };

  const duplicateVoice = (source: VoiceProfileRecord): void => {
    const now = new Date().toISOString();
    const voice: VoiceProfileRecord = {
      ...source,
      createdAt: now,
      examples: source.examples.map((example) => ({
        ...example,
        id: crypto.randomUUID(),
      })),
      id: crypto.randomUUID(),
      isStarter: false,
      name: `${source.name} copy`,
      updatedAt: now,
    };
    setVoices((current) => [...current, voice]);
    updateActiveDocument({
      styleProfile: voiceToStyleProfile(voice),
      voiceProfileId: voice.id,
    });
  };

  const deleteVoice = (voice: VoiceProfileRecord): void => {
    if (voice.isStarter) {
      return;
    }

    const referenceCount = documents.filter(
      (document) => document.voiceProfileId === voice.id,
    ).length;

    if (
      referenceCount > 0 &&
      !window.confirm(
        `${referenceCount} document${referenceCount === 1 ? '' : 's'} use this voice. Delete it and switch them to Product notes?`,
      )
    ) {
      return;
    }

    setVoices((current) =>
      current.filter((candidate) => candidate.id !== voice.id),
    );
    setDocuments((current) =>
      current.map((document) =>
        document.voiceProfileId === voice.id
          ? {
              ...document,
              styleProfile: voiceToStyleProfile(DEFAULT_VOICE_PROFILE),
              updatedAt: new Date().toISOString(),
              voiceProfileId: DEFAULT_VOICE_PROFILE.id,
            }
          : document,
      ),
    );
  };

  const exportVoice = (voice: VoiceProfileRecord): void => {
    const blob = new Blob([JSON.stringify(voice, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${voice.name.toLowerCase().replaceAll(' ', '-')}.voice.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importVoice = (text: string, fileName: string): void => {
    try {
      if (!fileName.toLowerCase().endsWith('.json')) {
        if (!text.trim()) {
          throw new Error('Imported writing examples cannot be empty.');
        }

        updateVoice({
          ...activeVoice,
          examples: [
            ...activeVoice.examples,
            {
              createdAt: new Date().toISOString(),
              id: crypto.randomUUID(),
              label: fileName,
              text: text.trim(),
            },
          ],
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      const imported = parseVoiceProfileImport(text);
      const existing = voices.some((voice) => voice.id === imported.id);
      setVoices((current) =>
        existing
          ? current.map((voice) =>
              voice.id === imported.id ? imported : voice,
            )
          : [...current, imported],
      );
      updateActiveDocument({
        styleProfile: voiceToStyleProfile(imported),
        voiceProfileId: imported.id,
      });
      setVoiceError(undefined);
    } catch (importError) {
      setVoiceError(
        importError instanceof Error
          ? importError.message
          : 'Voice import failed.',
      );
    }
  };

  const handleNewDocument = (): void => {
    const next = createBlankDocument();
    setDocuments((current) => [next, ...current]);
    setActiveId(next.id);
    setError(undefined);
    setMobileTab('source');
    closeMobileSheet();
  };

  const duplicateDocument = (): void => {
    setError(undefined);
    const now = new Date().toISOString();
    const duplicate: DocumentRecord = {
      ...activeDocument,
      createdAt: now,
      id: crypto.randomUUID(),
      selectedVersionId: undefined,
      title: `${activeDocument.title} copy`,
      updatedAt: now,
      versions: activeDocument.versions?.map((version) => ({
        ...version,
        id: crypto.randomUUID(),
      })),
    };
    setDocuments((current) => [duplicate, ...current]);
    setActiveId(duplicate.id);
  };

  const trashDocument = (): void => {
    if (
      !window.confirm(`Move "${activeDocument.title}" to recent deletions?`)
    ) {
      return;
    }

    const nextDocument = visibleDocuments.find(
      (document) => document.id !== activeDocument.id,
    );
    const replacement = nextDocument ? undefined : createBlankDocument();
    setDocuments((current) => [
      ...(replacement ? [replacement] : []),
      ...current.map((document) =>
        document.id === activeDocument.id
          ? { ...document, trashedAt: new Date().toISOString() }
          : document,
      ),
    ]);
    setLastDeletedId(activeDocument.id);
    setActiveId(nextDocument?.id ?? replacement?.id ?? '');
  };

  const restoreLastDeleted = (): void => {
    if (!lastDeletedId) {
      return;
    }

    setDocuments((current) =>
      current.map((document) =>
        document.id === lastDeletedId
          ? { ...document, trashedAt: undefined }
          : document,
      ),
    );
    setActiveId(lastDeletedId);
    setLastDeletedId(undefined);
    setError(undefined);
  };

  const exportBackup = (): void => {
    const backup = createAppBackup(documents, voices);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stylemakar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (text: string): void => {
    try {
      const backup = parseAppBackup(text);
      setDocuments(backup.documents);
      setVoices(backup.voices);
      setActiveId(
        backup.documents.find((document) => !document.trashedAt)?.id ?? '',
      );
      setStorageError(undefined);
    } catch (importError) {
      setStorageError(
        importError instanceof Error
          ? importError.message
          : 'Backup import failed.',
      );
    }
  };

  const handleSelectDocument = (id: string): void => {
    rewriteAbortRef.current?.abort();
    activeRunRef.current = undefined;
    setIsRewriting(false);
    setRewriteProgress(undefined);
    setActiveId(id);
    setError(undefined);
    setMobileTab('source');
    closeMobileSheet();
  };

  const openMobileSheet = (
    sheet: MobileSheet,
    event?: MouseEvent<HTMLButtonElement>,
  ): void => {
    sheetTriggerRef.current = event?.currentTarget ?? null;
    setActiveSheet(sheet);
  };

  const closeMobileSheet = (): void => {
    setActiveSheet(undefined);
    window.setTimeout(() => sheetTriggerRef.current?.focus(), 0);
  };

  const handleRewrite = async (): Promise<void> => {
    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    const runId = crypto.randomUUID();
    const documentId = activeDocument.id;
    rewriteAbortRef.current = controller;
    activeRunRef.current = { documentId, runId };
    setIsRewriting(true);
    setError(undefined);
    setRewriteProgress({
      attempt: 0,
      message: 'Checking provider readiness.',
      runId,
      segmentCount: 1,
      segmentIndex: 0,
      stage: 'queued',
    });

    try {
      const readiness = capabilityMatchesProvider(capability, provider)
        ? capability
        : await runProviderCheck(provider);

      if (!readiness?.rewriteReady || !readiness.selectedModel) {
        setError(
          readiness?.error?.message ??
            'Set up a compatible provider and model before rewriting.',
        );
        setDetailsOpen(true);
        return;
      }

      const readyProvider = withModelDefaults(
        provider,
        readiness.selectedModel,
      );
      const result = await rewriteDocument(
        {
          document: activeDocument.originalText,
          provider: readyProvider,
          referenceExamples: activeVoice.examples.map(
            (example) => example.text,
          ),
          styleProfile: activeDocument.styleProfile,
        },
        {
          onProgress: (progress) => {
            if (activeRunRef.current?.runId === runId) {
              setRewriteProgress(progress);
            }
          },
          runId,
          signal: controller.signal,
        },
      );

      if (
        activeRunRef.current?.runId !== runId ||
        activeRunRef.current.documentId !== documentId
      ) {
        return;
      }

      const segmentResults = result.debug?.segmentResults ?? [];
      const meaning =
        segmentResults.length === 0
          ? 'not-checked'
          : segmentResults.every((segment) => segment.meaningCheck.pass)
            ? 'passed'
            : 'failed';
      const styleScores = segmentResults
        .map((segment) => segment.attempts.at(-1)?.grade.overall)
        .filter((score): score is number => typeof score === 'number');
      const version: RewriteVersion = {
        createdAt: new Date().toISOString(),
        editedText: result.content,
        generatedText: result.content,
        id: crypto.randomUUID(),
        model: result.model,
        providerId: readyProvider.id,
        quality: {
          meaning,
          preservedDetails: segmentResults.flatMap(
            (segment) => segment.meaningRepresentation?.mandatoryDetails ?? [],
          ),
          risks: segmentResults.flatMap((segment) => [
            ...segment.meaningCheck.addedClaims,
            ...segment.meaningCheck.changedMeaning,
            ...segment.meaningCheck.missingDetails,
          ]),
          styleScore:
            styleScores.length > 0
              ? Math.round(
                  styleScores.reduce((total, score) => total + score, 0) /
                    styleScores.length,
                )
              : undefined,
          warnings: result.warnings,
        },
        runId,
        voiceProfileId: activeVoice.id,
        voiceSnapshot: structuredClone(activeVoice),
      };
      updateActiveDocument({
        debug: result.debug,
        provider: withModelDefaults(readyProvider, result.model),
        rewrittenText: result.content,
        selectedVersionId: version.id,
        versions: [...(activeDocument.versions ?? []), version],
        warnings: result.warnings,
      });
      setProvider((current) => withModelDefaults(current, result.model));
      setMobileTab('rewrite');
    } catch (rewriteError) {
      if (rewriteError instanceof Error && rewriteError.name === 'AbortError') {
        if (activeRunRef.current?.runId === runId) {
          setError(
            'Rewrite cancelled. Your source and previous version are unchanged.',
          );
        }
        return;
      }

      setError(
        rewriteError instanceof Error
          ? rewriteError.message
          : 'Rewrite failed.',
      );
    } finally {
      if (activeRunRef.current?.runId === runId) {
        activeRunRef.current = undefined;
        rewriteAbortRef.current = undefined;
        setIsRewriting(false);
        setRewriteProgress(undefined);
      }
    }
  };

  const cancelRewrite = (): void => {
    rewriteAbortRef.current?.abort();
    activeRunRef.current = undefined;
    rewriteAbortRef.current = undefined;
    setIsRewriting(false);
    setRewriteProgress(undefined);
    setError(
      'Rewrite cancelled. Your source and previous version are unchanged.',
    );
  };

  const selectVersion = (versionId: string): void => {
    const version = activeDocument.versions?.find(
      (candidate) => candidate.id === versionId,
    );

    if (version) {
      setError(undefined);
      updateActiveDocument({
        rewrittenText: version.editedText,
        selectedVersionId: version.id,
        warnings: version.quality.warnings,
      });
    }
  };

  const editActiveVersion = (editedText: string): void => {
    if (!activeVersion) {
      updateActiveDocument({ rewrittenText: editedText });
      return;
    }

    updateActiveDocument({
      rewrittenText: editedText,
      versions: activeDocument.versions?.map((version) =>
        version.id === activeVersion.id ? { ...version, editedText } : version,
      ),
    });
  };

  const duplicateActiveVersion = (): void => {
    if (!activeVersion) {
      return;
    }

    const duplicate: RewriteVersion = {
      ...activeVersion,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      runId: `duplicate-${activeVersion.runId}`,
    };
    updateActiveDocument({
      selectedVersionId: duplicate.id,
      versions: [...(activeDocument.versions ?? []), duplicate],
    });
  };

  const acceptActiveVersion = (): void => {
    if (!activeVersion) {
      return;
    }

    updateActiveDocument({
      versions: activeDocument.versions?.map((version) =>
        version.id === activeVersion.id
          ? { ...version, acceptedAt: new Date().toISOString() }
          : version,
      ),
    });
  };

  const confirmVersionUse = (version?: RewriteVersion): boolean => {
    if (
      !version ||
      (version.quality.meaning === 'passed' &&
        version.quality.warnings.length === 0)
    ) {
      return true;
    }

    return window.confirm(
      'This version has quality checks that need review. Continue anyway?',
    );
  };

  const handleCopy = async (
    text: string,
    version?: RewriteVersion,
  ): Promise<void> => {
    if (!confirmVersionUse(version)) {
      return;
    }
    await navigator.clipboard.writeText(text);
  };

  const handleExport = (): void => {
    if (!confirmVersionUse(activeVersion)) {
      return;
    }
    const blob = new Blob([activeDocument.rewrittenText], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDocument.title.toLowerCase().replaceAll(' ', '-')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mobile-shell">
        <div className="mobile-shell-content" ref={mobileContentRef}>
          <header className="mobile-appbar">
            <div className="mobile-brand">
              <Sparkles size={24} />
              <span>StyleMakar</span>
            </div>
            <span
              className={`mobile-status-chip ${
                providerStatus === 'Offline'
                  ? 'mobile-status-offline'
                  : providerStatus === 'Checking'
                    ? 'mobile-status-checking'
                    : ''
              }`}
              aria-live="polite"
            >
              <span
                className={
                  providerStatus === 'Offline'
                    ? 'dot offline'
                    : providerStatus === 'Checking'
                      ? 'dot checking'
                      : 'dot'
                }
              />
              {providerStatus}
            </span>
            <button
              aria-label="Open document switcher"
              className="mobile-icon-button"
              onClick={(event) => openMobileSheet('documents', event)}
              type="button"
            >
              <Menu size={24} />
            </button>
          </header>

          <button
            className="mobile-document-row"
            onClick={(event) => openMobileSheet('documents', event)}
            type="button"
          >
            <FileText size={23} />
            <span className="mobile-document-title">
              {activeDocument.title}
            </span>
            <span aria-live="polite" className="mobile-saved">
              <CheckCircle2 size={15} />
              {contentSaveStatus === 'saving'
                ? 'Saving…'
                : contentSaveStatus === 'error'
                  ? 'Save failed'
                  : 'Saved'}
            </span>
            <ChevronDown size={18} />
          </button>

          {error ? (
            <div className="mobile-error-banner" role="alert">
              {error}
            </div>
          ) : null}

          <nav
            aria-label="Rewrite workspace views"
            className="mobile-tabs"
            role="tablist"
          >
            <button
              aria-controls="mobile-source-panel"
              aria-selected={mobileTab === 'source'}
              className={mobileTab === 'source' ? 'mobile-tab-active' : ''}
              onClick={() => setMobileTab('source')}
              role="tab"
              type="button"
            >
              <PenLine size={17} />
              Source
            </button>
            <button
              aria-controls="mobile-rewrite-panel"
              aria-selected={mobileTab === 'rewrite'}
              className={mobileTab === 'rewrite' ? 'mobile-tab-active' : ''}
              onClick={() => setMobileTab('rewrite')}
              role="tab"
              type="button"
            >
              <Sparkles size={17} />
              Rewrite
              {activeDocument.rewrittenText ? (
                <span>{rewrittenWordCount.toLocaleString()} words</span>
              ) : null}
            </button>
          </nav>

          <main className="mobile-main">
            {mobileTab === 'source' ? (
              <section
                aria-labelledby="mobile-source-heading"
                className="mobile-tab-panel"
                id="mobile-source-panel"
                role="tabpanel"
              >
                <article className="mobile-editor-surface">
                  <header>
                    <div>
                      <span className="pane-kicker">Source</span>
                      <h2 id="mobile-source-heading">
                        Write or paste source content
                      </h2>
                      <p>Use the draft you want StyleMakar to rewrite.</p>
                    </div>
                    <PenLine size={20} />
                  </header>
                  <textarea
                    aria-label="Source text"
                    placeholder="Paste a paragraph, email, note, or draft..."
                    value={activeDocument.originalText}
                    onChange={(event) =>
                      updateActiveDocument({ originalText: event.target.value })
                    }
                  />
                  <footer>
                    <span>{sourceWordCount.toLocaleString()} words</span>
                    <button
                      onClick={() => {
                        void handleCopy(activeDocument.originalText);
                      }}
                      type="button"
                    >
                      <Clipboard size={16} />
                      Copy source
                    </button>
                  </footer>
                </article>

                <section className="mobile-voice-row" aria-label="Voice">
                  <BookOpenText size={20} />
                  <span>Based on {activeVoice.name}</span>
                  <button
                    onClick={(event) => openMobileSheet('examples', event)}
                    type="button"
                  >
                    {selectedExamples.length} examples
                  </button>
                  <button
                    className="mobile-add-link"
                    onClick={() => setVoiceManagerOpen(true)}
                    type="button"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </section>

                <section
                  className="mobile-check-row"
                  aria-label="Checks status"
                >
                  <span>
                    <ShieldCheck size={18} />
                    Meaning checks on
                  </span>
                  <span
                    className={
                      providerStatus === 'Offline'
                        ? 'mobile-check-offline'
                        : providerStatus === 'Checking'
                          ? 'mobile-check-checking'
                          : providerStatus === 'Ready'
                            ? 'mobile-check-ready'
                            : 'mobile-check-offline'
                    }
                  >
                    <span
                      className={
                        providerStatus === 'Offline'
                          ? 'dot offline'
                          : providerStatus === 'Checking'
                            ? 'dot checking'
                            : 'dot'
                      }
                    />
                    {modelStatusLabel(providerStatus)}
                  </span>
                  <button
                    aria-label="Open checks"
                    onClick={(event) => openMobileSheet('checks', event)}
                    type="button"
                  >
                    <Info size={17} />
                  </button>
                </section>
              </section>
            ) : (
              <section
                aria-labelledby="mobile-rewrite-heading"
                className="mobile-tab-panel"
                id="mobile-rewrite-panel"
                role="tabpanel"
              >
                <article className="mobile-editor-surface mobile-output-surface">
                  <header>
                    <div>
                      <span className="pane-kicker">Rewrite</span>
                      <h2 id="mobile-rewrite-heading">Review output</h2>
                      <p>
                        {activeVersion?.quality.meaning === 'passed'
                          ? `Meaning check passed with ${activeVersion.voiceSnapshot?.name ?? activeVoice.name} voice.`
                          : 'Review quality checks before using this version.'}
                      </p>
                    </div>
                    <select
                      aria-label="Rewrite version"
                      onChange={(event) => selectVersion(event.target.value)}
                      value={activeVersion?.id ?? ''}
                    >
                      {(activeDocument.versions ?? []).map((version, index) => (
                        <option key={version.id} value={version.id}>
                          Version {index + 1} · {displayDate(version.createdAt)}
                        </option>
                      ))}
                    </select>
                  </header>

                  {activeVersion &&
                  (activeVersion.quality.meaning !== 'passed' ||
                    activeVersion.quality.warnings.length > 0) ? (
                    <div className="version-warning" role="status">
                      Review this version before copying or exporting it.{' '}
                      {activeVersion.quality.warnings.join(' ') ||
                        `Meaning status: ${activeVersion.quality.meaning}.`}
                    </div>
                  ) : null}

                  {activeDocument.rewrittenText ? (
                    <textarea
                      aria-label="Rewritten text"
                      onChange={(event) =>
                        editActiveVersion(event.target.value)
                      }
                      value={activeDocument.rewrittenText}
                    />
                  ) : (
                    <div className="mobile-empty-output">
                      <FileText size={42} />
                      <p>Your rewritten text will appear here.</p>
                      <span>
                        Run Rewrite from the Source tab to review it here.
                      </span>
                    </div>
                  )}

                  <footer>
                    <span>{rewrittenWordCount.toLocaleString()} words</span>
                    <div className="mobile-output-actions">
                      <button
                        disabled={!activeDocument.rewrittenText}
                        onClick={() => {
                          void handleCopy(
                            activeDocument.rewrittenText,
                            activeVersion,
                          );
                        }}
                        type="button"
                      >
                        <Copy size={16} />
                        Copy
                      </button>
                      <button
                        disabled={!activeVersion}
                        onClick={acceptActiveVersion}
                        type="button"
                      >
                        <CheckCircle2 size={16} />
                        {activeVersion?.acceptedAt ? 'Accepted' : 'Accept'}
                      </button>
                      <button
                        disabled={!activeDocument.rewrittenText}
                        onClick={handleExport}
                        type="button"
                      >
                        <Download size={16} />
                        Export
                      </button>
                      <button
                        disabled={!activeDocument.rewrittenText}
                        onClick={(event) => openMobileSheet('compare', event)}
                        type="button"
                      >
                        <Eye size={16} />
                        Compare
                      </button>
                    </div>
                  </footer>
                </article>

                <button
                  className="mobile-source-summary"
                  onClick={() => setMobileTab('source')}
                  type="button"
                >
                  <FileText size={18} />
                  <span>Source: {sourceWordCount.toLocaleString()} words</span>
                  <ChevronDown size={16} />
                </button>
              </section>
            )}
          </main>

          <div className="mobile-bottom-bar">
            {rewriteProgress ? (
              <span className="mobile-rewrite-progress" aria-live="polite">
                {rewriteProgress.message}
              </span>
            ) : null}
            <button
              className="mobile-secondary-action"
              onClick={(event) => openMobileSheet('checks', event)}
              type="button"
            >
              <SlidersHorizontal size={20} />
              Checks
            </button>
            <button
              className="mobile-rewrite-action"
              disabled={
                !isRewriting && activeDocument.originalText.trim() === ''
              }
              onClick={() => {
                if (isRewriting) {
                  cancelRewrite();
                } else {
                  void handleRewrite();
                }
              }}
              type="button"
            >
              {isRewriting ? <X size={21} /> : <Sparkles size={21} />}
              {isRewriting
                ? 'Cancel rewrite'
                : mobileTab === 'rewrite'
                  ? 'Rewrite again'
                  : 'Rewrite'}
            </button>
          </div>
        </div>

        {activeSheet ? (
          <div className="mobile-sheet-layer" role="presentation">
            <button
              aria-label="Close sheet"
              className="mobile-sheet-backdrop"
              onClick={closeMobileSheet}
              type="button"
            />
            <section
              aria-label={`${activeSheet} sheet`}
              aria-modal="true"
              className="mobile-sheet"
              ref={sheetRef}
              role="dialog"
            >
              <div className="mobile-sheet-handle" aria-hidden="true" />
              <header className="mobile-sheet-header">
                <h2>
                  {activeSheet === 'documents'
                    ? 'Documents'
                    : activeSheet === 'examples'
                      ? `${activeVoice.name} examples`
                      : activeSheet === 'compare'
                        ? 'Compare'
                        : 'Advanced checks'}
                </h2>
                <button
                  aria-label="Close sheet"
                  className="mobile-icon-button"
                  onClick={closeMobileSheet}
                  type="button"
                >
                  <X size={20} />
                </button>
              </header>

              {activeSheet === 'documents' ? (
                <div className="mobile-sheet-content">
                  <label className="mobile-title-edit">
                    <span>Document title</span>
                    <input
                      value={activeDocument.title}
                      onChange={(event) =>
                        updateActiveDocument({ title: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="mobile-sheet-primary"
                    onClick={handleNewDocument}
                    type="button"
                  >
                    <Plus size={18} />
                    New draft
                  </button>
                  <div className="mobile-document-actions">
                    <button onClick={duplicateDocument} type="button">
                      <Copy size={16} /> Duplicate
                    </button>
                    <button onClick={trashDocument} type="button">
                      <Trash2 size={16} /> Delete
                    </button>
                    <button onClick={exportBackup} type="button">
                      <Download size={16} /> Backup all
                    </button>
                  </div>
                  <div className="mobile-draft-list">
                    {visibleDocuments.slice(0, 7).map((document) => (
                      <DraftRow
                        active={document.id === activeDocument.id}
                        document={document}
                        key={document.id}
                        onSelect={() => handleSelectDocument(document.id)}
                      />
                    ))}
                  </div>
                  <span className="mobile-sheet-status">
                    <span
                      className={
                        providerStatus === 'Offline' ? 'dot offline' : 'dot'
                      }
                    />
                    {modelStatusLabel(providerStatus)}
                  </span>
                </div>
              ) : null}

              {activeSheet === 'examples' ? (
                <div className="mobile-sheet-content">
                  <button
                    className="mobile-sheet-primary"
                    onClick={() => {
                      closeMobileSheet();
                      setVoiceManagerOpen(true);
                    }}
                    type="button"
                  >
                    <Plus size={18} />
                    Manage voices and examples
                  </button>
                  {selectedExamples.map((example, index) => (
                    <ExampleSnippet
                      example={example.text}
                      key={example.id}
                      label={example.label ?? `Example ${index + 1}`}
                    />
                  ))}
                </div>
              ) : null}

              {activeSheet === 'checks' ? (
                <div className="mobile-sheet-content">
                  <ProviderSettingsFields
                    capability={capability}
                    checking={isCheckingProvider}
                    models={models}
                    onChange={setProvider}
                    onCheck={() => {
                      void runProviderCheck(provider);
                    }}
                    provider={provider}
                    status={providerStatus}
                  />
                  <pre className="debug-panel">
                    {JSON.stringify(
                      activeDocument.debug ?? { status: 'No rewrite run yet' },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              ) : null}

              {activeSheet === 'compare' ? (
                <div className="mobile-sheet-content mobile-compare-content">
                  <section>
                    <span className="pane-kicker">Source</span>
                    <p>{activeDocument.originalText}</p>
                  </section>
                  <section>
                    <span className="pane-kicker">Rewrite</span>
                    <p>
                      {activeDocument.rewrittenText ||
                        'Run Rewrite to compare the output.'}
                    </p>
                  </section>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>

      <div className="app-shell">
        <aside className="sidebar" aria-label="Documents">
          <div className="brand">
            <Sparkles size={25} />
            <span>StyleMakar</span>
          </div>

          <button
            className="new-button"
            onClick={handleNewDocument}
            type="button"
          >
            <Plus size={18} />
            New
          </button>

          <section className="sidebar-section">
            <p>Recent drafts</p>
            <input
              aria-label="Search documents"
              className="document-search"
              onChange={(event) => setDocumentSearch(event.target.value)}
              placeholder="Search drafts"
              value={documentSearch}
            />
            {visibleDocuments.slice(0, 7).map((document) => (
              <DraftRow
                active={document.id === activeDocument.id}
                document={document}
                key={document.id}
                onSelect={() => handleSelectDocument(document.id)}
              />
            ))}
            {visibleDocuments.length === 0 ? (
              <span className="empty-document-search">No matching drafts.</span>
            ) : null}
          </section>

          <div className="backup-actions">
            <button onClick={exportBackup} type="button">
              <Download size={15} /> Backup
            </button>
            <label>
              <Upload size={15} /> Restore
              <input
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  if (file) {
                    void file.text().then(importBackup);
                  }

                  event.target.value = '';
                }}
                type="file"
              />
            </label>
          </div>

          <button
            className={`model-pill ${providerStatus !== 'Ready' ? 'model-pill-offline' : ''}`}
            onClick={() => setDetailsOpen(true)}
            type="button"
          >
            <span
              className={providerStatus === 'Ready' ? 'dot' : 'dot offline'}
            />
            {modelStatusLabel(providerStatus)}
            <ChevronDown size={15} />
          </button>
        </aside>

        <main className="workspace">
          <section className="document-title-row">
            <input
              aria-label="Document title"
              className="title-input"
              value={activeDocument.title}
              onChange={(event) =>
                updateActiveDocument({ title: event.target.value })
              }
            />
            <span aria-live="polite" className="saved">
              <CheckCircle2 size={15} />{' '}
              {contentSaveStatus === 'saving'
                ? 'Saving…'
                : contentSaveStatus === 'error'
                  ? 'Save failed'
                  : 'Saved'}
            </span>
            <div className="document-actions">
              <button onClick={duplicateDocument} type="button">
                <Copy size={15} /> Duplicate
              </button>
              <button onClick={trashDocument} type="button">
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </section>

          {storageError ? (
            <div className="error-banner" role="alert">
              {storageError}
            </div>
          ) : null}
          {lastDeletedId ? (
            <div className="undo-banner" role="status">
              Document moved to recent deletions.
              <button onClick={restoreLastDeleted} type="button">
                Undo
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="error-banner" role="alert">
              {error}
            </div>
          ) : null}

          {providerStatus !== 'Ready' ? (
            <section
              className="provider-setup-card"
              aria-label="Provider setup"
            >
              <div>
                <span className="pane-kicker">Provider setup</span>
                <h2>{modelStatusLabel(providerStatus)}</h2>
                <p>
                  Stylemakar verifies the endpoint, exact model ID, and
                  structured JSON output before it enables a rewrite.
                </p>
              </div>
              <ProviderSettingsFields
                capability={capability}
                checking={isCheckingProvider}
                models={models}
                onChange={setProvider}
                onCheck={() => {
                  void runProviderCheck(provider);
                }}
                provider={provider}
                status={providerStatus}
              />
            </section>
          ) : null}

          <section className="writing-flow" aria-label="Rewrite workspace">
            <article className="writing-pane source-pane">
              <header>
                <div>
                  <span className="pane-kicker">Source</span>
                  <h2>Start writing or paste your text here</h2>
                </div>
                <PenLine size={18} />
              </header>
              <textarea
                aria-label="Source text"
                placeholder="Paste a paragraph, email, note, or draft..."
                value={activeDocument.originalText}
                onChange={(event) =>
                  updateActiveDocument({ originalText: event.target.value })
                }
              />
              <footer>
                <span>{sourceWordCount.toLocaleString()} words</span>
                <button
                  onClick={() => {
                    void handleCopy(activeDocument.originalText);
                  }}
                  type="button"
                >
                  <Clipboard size={16} />
                  Copy source
                </button>
              </footer>
            </article>

            <section className="rewrite-controls" aria-label="Rewrite controls">
              <label className="voice-control">
                <span>Based on</span>
                <select
                  value={activeVoice.id}
                  onChange={(event) => selectVoice(event.target.value)}
                >
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}
                    </option>
                  ))}
                </select>
                <small>
                  {selectedExamples.length} examples define this voice
                </small>
              </label>

              <button
                className="add-examples-button"
                onClick={() => setVoiceManagerOpen(true)}
                type="button"
              >
                <Plus size={18} />
                Add examples
              </button>

              <button
                className="rewrite-button"
                disabled={
                  !isRewriting && activeDocument.originalText.trim() === ''
                }
                onClick={() => {
                  if (isRewriting) {
                    cancelRewrite();
                  } else {
                    void handleRewrite();
                  }
                }}
                type="button"
              >
                {isRewriting ? <X size={19} /> : <Sparkles size={19} />}
                {isRewriting ? 'Cancel' : 'Rewrite'}
              </button>

              {rewriteProgress ? (
                <div className="rewrite-progress" aria-live="polite">
                  <span>
                    {rewriteProgress.segmentCount > 1
                      ? `${Math.min(rewriteProgress.segmentIndex + 1, rewriteProgress.segmentCount)} / ${rewriteProgress.segmentCount}`
                      : 'Working'}
                  </span>
                  <strong>{rewriteProgress.message}</strong>
                </div>
              ) : null}

              <p>
                Rewrite uses the {activeVoice.name} examples to match voice and
                tone while keeping the meaning intact.
              </p>
            </section>

            <article className="writing-pane output-pane">
              <header>
                <div>
                  <span className="pane-kicker">Output</span>
                  <h2>Rewrite</h2>
                </div>
                <select
                  aria-label="Rewrite version"
                  onChange={(event) => selectVersion(event.target.value)}
                  value={activeVersion?.id ?? ''}
                >
                  {(activeDocument.versions ?? []).map((version, index) => (
                    <option key={version.id} value={version.id}>
                      Version {index + 1} · {displayDate(version.createdAt)}
                    </option>
                  ))}
                </select>
              </header>

              {activeVersion &&
              (activeVersion.quality.meaning !== 'passed' ||
                activeVersion.quality.warnings.length > 0) ? (
                <div className="version-warning" role="status">
                  Review this version before copying or exporting it.{' '}
                  {activeVersion.quality.warnings.join(' ') ||
                    `Meaning status: ${activeVersion.quality.meaning}.`}
                </div>
              ) : null}

              {activeDocument.rewrittenText ? (
                <textarea
                  aria-label="Rewritten text"
                  onChange={(event) => editActiveVersion(event.target.value)}
                  value={activeDocument.rewrittenText}
                />
              ) : (
                <div className="empty-output">
                  <FileText size={46} />
                  <p>Your rewritten text will appear here.</p>
                  <span>Review, copy, and use it anywhere.</span>
                </div>
              )}

              <footer>
                <span>{rewrittenWordCount.toLocaleString()} words</span>
                <div className="output-actions">
                  <button
                    disabled={!activeDocument.rewrittenText}
                    onClick={() => {
                      void handleCopy(
                        activeDocument.rewrittenText,
                        activeVersion,
                      );
                    }}
                    type="button"
                  >
                    <Copy size={16} />
                    Copy
                  </button>
                  <button
                    disabled={!activeVersion}
                    onClick={acceptActiveVersion}
                    type="button"
                  >
                    <CheckCircle2 size={16} />
                    {activeVersion?.acceptedAt ? 'Accepted' : 'Accept'}
                  </button>
                  <button
                    disabled={!activeVersion}
                    onClick={() =>
                      activeVersion &&
                      editActiveVersion(activeVersion.generatedText)
                    }
                    type="button"
                  >
                    <RotateCcw size={16} />
                    Revert edits
                  </button>
                  <button
                    disabled={!activeVersion}
                    onClick={duplicateActiveVersion}
                    type="button"
                  >
                    <Copy size={16} />
                    Duplicate
                  </button>
                  <button
                    disabled={!activeDocument.rewrittenText}
                    onClick={handleExport}
                    type="button"
                  >
                    <Download size={16} />
                    Export
                  </button>
                </div>
              </footer>
            </article>
          </section>

          <section
            className={`advanced-row ${detailsOpen ? 'advanced-row-open' : ''}`}
            aria-label="Advanced checks"
          >
            <button
              className="advanced-toggle"
              onClick={() => setDetailsOpen((value) => !value)}
              type="button"
            >
              <SlidersHorizontal size={18} />
              Advanced checks
              <ChevronDown size={16} />
            </button>
            <div className="advanced-chips">
              <span>
                <BookOpenText size={15} />
                {provider.model ?? 'Gemma 4'}
              </span>
              <span>
                <ShieldCheck size={15} />
                Meaning on
              </span>
              <span>
                <BarChart3 size={15} />
                Style score hidden
              </span>
            </div>
          </section>

          {detailsOpen ? (
            <section className="advanced-panel">
              <ProviderSettingsFields
                capability={capability}
                checking={isCheckingProvider}
                models={models}
                onChange={setProvider}
                onCheck={() => {
                  void runProviderCheck(provider);
                }}
                provider={provider}
                status={providerStatus}
              />

              <div className="quality-summary">
                <h3>Selected version quality</h3>
                {activeVersion ? (
                  <>
                    <dl>
                      <div>
                        <dt>Meaning</dt>
                        <dd>{activeVersion.quality.meaning}</dd>
                      </div>
                      <div>
                        <dt>Style score</dt>
                        <dd>
                          {activeVersion.quality.styleScore ?? 'Not available'}
                        </dd>
                      </div>
                      <div>
                        <dt>Warnings</dt>
                        <dd>{activeVersion.quality.warnings.length}</dd>
                      </div>
                    </dl>
                    {activeVersion.quality.warnings.length > 0 ? (
                      <ul>
                        {activeVersion.quality.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No quality warnings were reported.</p>
                    )}
                  </>
                ) : (
                  <p>Run a rewrite to create a quality record.</p>
                )}
                <details>
                  <summary>Developer diagnostics</summary>
                  <pre className="debug-panel">
                    {JSON.stringify(
                      activeDocument.debug ?? { status: 'No rewrite run yet' },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
            </section>
          ) : null}

          <section className="examples-strip" aria-label="Writing examples">
            <div className="examples-intro">
              <strong>{activeVoice.name} examples</strong>
              <span>
                These examples define the voice used for this rewrite.
              </span>
            </div>
            {selectedExamples.map((example, index) => (
              <ExampleSnippet
                example={example.text}
                key={example.id}
                label={example.label ?? `Example ${index + 1}`}
              />
            ))}
          </section>
        </main>
      </div>

      {voiceManagerOpen ? (
        <VoiceManager
          error={voiceError}
          onClose={() => setVoiceManagerOpen(false)}
          onCreate={createVoice}
          onDelete={deleteVoice}
          onDuplicate={duplicateVoice}
          onExport={exportVoice}
          onImport={importVoice}
          onSelect={selectVoice}
          onUpdate={updateVoice}
          selected={activeVoice}
          voices={voices}
        />
      ) : null}
    </>
  );
}
