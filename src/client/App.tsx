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
  X,
} from 'lucide-react';
import type { MouseEvent, ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_REFERENCE_EXAMPLES,
  DEFAULT_STYLE_PROFILE,
} from '../shared/defaults';
import type { DocumentRecord, ModelProviderSettings } from '../shared/types';
import { getHealth, getModels, rewriteDocument } from './api';
import { seedDocuments } from './sampleData';
import {
  createBlankDocument,
  loadDocuments,
  loadProvider,
  saveDocuments,
  saveProvider,
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

function modelStatusLabel(health: string): string {
  if (health === 'Offline') {
    return 'Provider offline';
  }

  if (health === 'Checking') {
    return 'Checking provider';
  }

  return 'Provider ready';
}

function mobileStatusLabel(health: string): string {
  if (health === 'Offline') {
    return 'Offline';
  }

  if (health === 'Checking') {
    return 'Checking';
  }

  return 'Ready';
}

function mobileModelLabel(health: string): string {
  if (health === 'Offline') {
    return 'Provider offline';
  }

  if (health === 'Checking') {
    return 'Checking provider';
  }

  return 'Provider ready';
}

function withModelDefaults(
  provider: ModelProviderSettings,
  model: string,
): ModelProviderSettings {
  return {
    ...provider,
    model,
    reasoningEffort: model.toLowerCase().includes('gemma-4-12b-qat')
      ? 'none'
      : provider.reasoningEffort,
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

export function App(): ReactElement | null {
  const [documents, setDocuments] = useState<DocumentRecord[]>(() =>
    loadDocuments(seedDocuments),
  );
  const [activeId, setActiveId] = useState(documents[0]?.id ?? '');
  const [provider, setProvider] = useState<ModelProviderSettings>(() =>
    loadProvider(),
  );
  const [models, setModels] = useState<string[]>([]);
  const [health, setHealth] = useState('Checking');
  const [isRewriting, setIsRewriting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('source');
  const [activeSheet, setActiveSheet] = useState<MobileSheet | undefined>();
  const mobileContentRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement | null>(null);

  const activeDocument = useMemo(
    () =>
      documents.find((document) => document.id === activeId) ?? documents[0],
    [activeId, documents],
  );
  const modelOptions = useMemo(
    () =>
      [provider.model ?? 'gemma-4', ...models].filter(
        (model, index, all) => model && all.indexOf(model) === index,
      ),
    [models, provider.model],
  );
  const sourceWordCount = activeDocument
    ? countWords(activeDocument.originalText)
    : 0;
  const rewrittenWordCount = activeDocument
    ? countWords(activeDocument.rewrittenText)
    : 0;
  const selectedExamples = DEFAULT_REFERENCE_EXAMPLES.slice(0, 2);

  useEffect(() => {
    saveDocuments(documents);
  }, [documents]);

  useEffect(() => {
    saveProvider(provider);
  }, [provider]);

  useEffect(() => {
    void getHealth(provider)
      .then((result) => {
        setHealth(result.lmStudioReachable ? 'Provider' : 'Offline');
        if (result.model && provider.model !== result.model) {
          setProvider((current) => withModelDefaults(current, result.model));
        }
      })
      .catch(() => setHealth('Offline'));

    void getModels(provider).then((result) => {
      setModels(result.map((model) => model.id));
    });
  }, [provider.baseUrl]);

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
          ? { ...document, ...patch, updatedAt: new Date().toISOString() }
          : document,
      ),
    );
  };

  const handleNewDocument = (): void => {
    const next = createBlankDocument();
    setDocuments((current) => [next, ...current]);
    setActiveId(next.id);
    setError(undefined);
    setMobileTab('source');
    closeMobileSheet();
  };

  const handleSelectDocument = (id: string): void => {
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
    setIsRewriting(true);
    setError(undefined);

    try {
      const result = await rewriteDocument({
        document: activeDocument.originalText,
        provider,
        styleProfile: activeDocument.styleProfile,
      });
      updateActiveDocument({
        debug: result.debug,
        provider: withModelDefaults(provider, result.model),
        rewrittenText: result.content,
        warnings: result.warnings,
      });
      setProvider((current) => withModelDefaults(current, result.model));
      setMobileTab('rewrite');
    } catch (rewriteError) {
      setError(
        rewriteError instanceof Error
          ? rewriteError.message
          : 'Rewrite failed.',
      );
    } finally {
      setIsRewriting(false);
    }
  };

  const handleCopy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text);
  };

  const handleExport = (): void => {
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
                health === 'Offline'
                  ? 'mobile-status-offline'
                  : health === 'Checking'
                    ? 'mobile-status-checking'
                    : ''
              }`}
            >
              <span
                className={
                  health === 'Offline'
                    ? 'dot offline'
                    : health === 'Checking'
                      ? 'dot checking'
                      : 'dot'
                }
              />
              {mobileStatusLabel(health)}
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
            <span className="mobile-saved">
              <CheckCircle2 size={15} />
              Saved
            </span>
            <ChevronDown size={18} />
          </button>

          {error ? <div className="mobile-error-banner">{error}</div> : null}

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
                  <span>Based on Product notes</span>
                  <button
                    onClick={(event) => openMobileSheet('examples', event)}
                    type="button"
                  >
                    {selectedExamples.length} examples
                  </button>
                  <button
                    className="mobile-add-link"
                    onClick={(event) => openMobileSheet('examples', event)}
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
                      health === 'Offline'
                        ? 'mobile-check-offline'
                        : health === 'Checking'
                          ? 'mobile-check-checking'
                          : 'mobile-check-ready'
                    }
                  >
                    <span
                      className={
                        health === 'Offline'
                          ? 'dot offline'
                          : health === 'Checking'
                            ? 'dot checking'
                            : 'dot'
                      }
                    />
                    {mobileModelLabel(health)}
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
                      <p>Meaning preserved with Product notes voice.</p>
                    </div>
                    <select
                      aria-label="Rewrite version"
                      defaultValue="version-1"
                    >
                      <option value="version-1">Version 1</option>
                    </select>
                  </header>

                  {activeDocument.rewrittenText ? (
                    <textarea
                      aria-label="Rewritten text"
                      readOnly
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
                          void handleCopy(activeDocument.rewrittenText);
                        }}
                        type="button"
                      >
                        <Copy size={16} />
                        Copy
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
                isRewriting || activeDocument.originalText.trim() === ''
              }
              onClick={() => {
                void handleRewrite();
              }}
              type="button"
            >
              {isRewriting ? <RotateCcw size={21} /> : <Sparkles size={21} />}
              {isRewriting
                ? 'Rewriting...'
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
                      ? 'Product notes examples'
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
                  <div className="mobile-draft-list">
                    {documents.slice(0, 7).map((document) => (
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
                      className={health === 'Offline' ? 'dot offline' : 'dot'}
                    />
                    {modelStatusLabel(health)}
                  </span>
                </div>
              ) : null}

              {activeSheet === 'examples' ? (
                <div className="mobile-sheet-content">
                  <button className="mobile-sheet-primary" type="button">
                    <Plus size={18} />
                    Add example
                  </button>
                  {selectedExamples.map((example, index) => (
                    <ExampleSnippet
                      example={example}
                      key={example}
                      label={`Product notes - ${index === 0 ? 'Apr 28' : 'Apr 21'}`}
                    />
                  ))}
                </div>
              ) : null}

              {activeSheet === 'checks' ? (
                <div className="mobile-sheet-content">
                  <div className="advanced-settings">
                    <label>
                      <span>Model</span>
                      <select
                        value={provider.model ?? 'gemma-4'}
                        onChange={(event) =>
                          setProvider((current) => ({
                            ...withModelDefaults(current, event.target.value),
                          }))
                        }
                      >
                        {modelOptions.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Endpoint</span>
                      <input
                        aria-label="Provider endpoint"
                        onChange={(event) =>
                          setProvider((current) => ({
                            ...current,
                            baseUrl: event.target.value,
                          }))
                        }
                        value={provider.baseUrl}
                      />
                    </label>
                    <label>
                      <span>Status</span>
                      <input readOnly value={modelStatusLabel(health)} />
                    </label>
                  </div>
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
            {documents.slice(0, 7).map((document) => (
              <DraftRow
                active={document.id === activeDocument.id}
                document={document}
                key={document.id}
                onSelect={() => handleSelectDocument(document.id)}
              />
            ))}
          </section>

          <button
            className={`model-pill ${health === 'Offline' ? 'model-pill-offline' : ''}`}
            onClick={() => setDetailsOpen(true)}
            type="button"
          >
            <span className={health === 'Offline' ? 'dot offline' : 'dot'} />
            {modelStatusLabel(health)}
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
            <span className="saved">
              <CheckCircle2 size={15} /> Saved
            </span>
          </section>

          {error ? <div className="error-banner">{error}</div> : null}

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
                  value={activeDocument.styleProfile.id}
                  onChange={() =>
                    updateActiveDocument({
                      styleProfile: DEFAULT_STYLE_PROFILE,
                    })
                  }
                >
                  <option value="technical">Product notes</option>
                </select>
                <small>
                  {selectedExamples.length} examples define this voice
                </small>
              </label>

              <button className="add-examples-button" type="button">
                <Plus size={18} />
                Add examples
              </button>

              <button
                className="rewrite-button"
                disabled={
                  isRewriting || activeDocument.originalText.trim() === ''
                }
                onClick={() => {
                  void handleRewrite();
                }}
                type="button"
              >
                <Sparkles size={19} />
                {isRewriting ? 'Rewriting...' : 'Rewrite'}
              </button>

              <p>
                Rewrite uses the Product notes examples to match voice and tone
                while keeping the meaning intact.
              </p>
            </section>

            <article className="writing-pane output-pane">
              <header>
                <div>
                  <span className="pane-kicker">Output</span>
                  <h2>Rewrite</h2>
                </div>
                <select aria-label="Rewrite version" defaultValue="version-1">
                  <option value="version-1">Version 1</option>
                </select>
              </header>

              {activeDocument.rewrittenText ? (
                <textarea
                  aria-label="Rewritten text"
                  readOnly
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
                      void handleCopy(activeDocument.rewrittenText);
                    }}
                    type="button"
                  >
                    <Copy size={16} />
                    Copy
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
              <div className="advanced-settings">
                <label>
                  <span>Model</span>
                  <select
                    value={provider.model ?? 'gemma-4'}
                    onChange={(event) =>
                      setProvider((current) => ({
                        ...withModelDefaults(current, event.target.value),
                      }))
                    }
                  >
                    {modelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Endpoint</span>
                  <input
                    aria-label="Provider endpoint"
                    onChange={(event) =>
                      setProvider((current) => ({
                        ...current,
                        baseUrl: event.target.value,
                      }))
                    }
                    value={provider.baseUrl}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <input readOnly value={modelStatusLabel(health)} />
                </label>
              </div>

              <pre className="debug-panel">
                {JSON.stringify(
                  activeDocument.debug ?? { status: 'No rewrite run yet' },
                  null,
                  2,
                )}
              </pre>
            </section>
          ) : null}

          <section className="examples-strip" aria-label="Writing examples">
            <div className="examples-intro">
              <strong>Product notes examples</strong>
              <span>
                These examples define the voice used for this rewrite.
              </span>
            </div>
            {selectedExamples.map((example, index) => (
              <ExampleSnippet
                example={example}
                key={example}
                label={`Product notes - ${index === 0 ? 'Apr 28' : 'Apr 21'}`}
              />
            ))}
          </section>
        </main>
      </div>
    </>
  );
}
