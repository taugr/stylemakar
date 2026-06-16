import {
  BarChart3,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  FileText,
  History,
  PenLine,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
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
    return 'LM Studio offline';
  }

  if (health === 'Checking') {
    return 'Checking model';
  }

  return 'LM Studio ready';
}

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
    void getHealth()
      .then((result) => {
        setHealth(result.lmStudioReachable ? 'LM Studio' : 'Offline');
        if (result.model && provider.model !== result.model) {
          setProvider((current) => ({ ...current, model: result.model }));
        }
      })
      .catch(() => setHealth('Offline'));

    void getModels().then((result) => {
      setModels(result.map((model) => model.id));
    });
  }, []);

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
  };

  const handleSelectDocument = (id: string): void => {
    setActiveId(id);
    setError(undefined);
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
        provider: { ...provider, model: result.model },
        rewrittenText: result.content,
        warnings: result.warnings,
      });
      setProvider((current) => ({ ...current, model: result.model }));
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
                  updateActiveDocument({ styleProfile: DEFAULT_STYLE_PROFILE })
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
                      ...current,
                      model: event.target.value,
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
                <input readOnly value={provider.baseUrl} />
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
            <span>These examples define the voice used for this rewrite.</span>
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
  );
}
