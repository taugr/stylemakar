import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  PenLine,
  Plus,
  Settings,
  Upload,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STYLE_PROFILE } from '../shared/defaults';
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

function SidebarItem(props: {
  active: boolean;
  document: DocumentRecord;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      className={`history-item ${props.active ? 'history-item-active' : ''}`}
      onClick={props.onSelect}
      type="button"
    >
      <FileText size={14} />
      <span>
        <strong>{props.document.title}</strong>
        <small>
          {props.active
            ? 'Today, 10:24 AM'
            : displayDate(props.document.updatedAt)}
        </small>
      </span>
      {props.active ? <i /> : null}
    </button>
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
      <aside className="sidebar">
        <div className="brand">
          <PenLine size={28} />
          <span>Style Rewriter</span>
        </div>

        <button
          className="new-button"
          onClick={handleNewDocument}
          type="button"
        >
          <Plus size={18} />
          New Document
        </button>

        <section className="sidebar-section">
          <p>History</p>
          {documents.slice(0, 5).map((document) => (
            <SidebarItem
              active={document.id === activeDocument.id}
              document={document}
              key={document.id}
              onSelect={() => setActiveId(document.id)}
            />
          ))}
          <button className="view-all" type="button">
            View all history <ArrowRight size={14} />
          </button>
        </section>

        <section className="provider-card">
          <p>Model Provider</p>
          <div className="provider-status">
            <span className={health === 'Offline' ? 'dot offline' : 'dot'} />
            {health}
          </div>
          <small>Model</small>
          <strong>{provider.model ?? 'gemma-4'}</strong>
          <small>Endpoint</small>
          <strong>{provider.baseUrl}</strong>
          <button type="button">Change Model</button>
        </section>

        <button className="settings-row" type="button">
          <Settings size={18} />
          Settings
          <ChevronDown size={16} />
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div />
          <label>
            <span>Style Profile</span>
            <select
              value={activeDocument.styleProfile.id}
              onChange={() =>
                updateActiveDocument({ styleProfile: DEFAULT_STYLE_PROFILE })
              }
            >
              <option value="technical">My Technical Style</option>
            </select>
          </label>
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
              {[provider.model ?? 'gemma-4', ...models]
                .filter(
                  (model, index, all) => model && all.indexOf(model) === index,
                )
                .map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="rewrite-button"
            disabled={isRewriting || activeDocument.originalText.trim() === ''}
            onClick={() => {
              void handleRewrite();
            }}
            type="button"
          >
            {isRewriting ? 'Rewriting...' : 'Rewrite'}
          </button>
          <button className="icon-button" type="button">
            <Settings size={18} />
          </button>
        </header>

        <section className="document-header">
          <h1>{activeDocument.title}</h1>
          <span className="saved">
            <Check size={15} /> Saved
          </span>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="editor-grid">
          <article className="panel">
            <header>
              <h2>Original Text</h2>
              <span>
                {countWords(activeDocument.originalText).toLocaleString()} words
              </span>
            </header>
            <textarea
              aria-label="Original text"
              value={activeDocument.originalText}
              onChange={(event) =>
                updateActiveDocument({ originalText: event.target.value })
              }
            />
            <footer>
              <button type="button">
                <Upload size={16} /> Replace text
              </button>
              <button
                onClick={() => {
                  void handleCopy(activeDocument.originalText);
                }}
                type="button"
              >
                <Copy size={16} /> Copy
              </button>
            </footer>
          </article>

          <div className="flow-arrow">
            <ArrowRight size={24} />
          </div>

          <article className="panel rewritten-panel">
            <header>
              <h2>Rewritten Text</h2>
              <span>
                {countWords(activeDocument.rewrittenText).toLocaleString()}{' '}
                words
              </span>
            </header>
            <textarea
              aria-label="Rewritten text"
              readOnly
              value={activeDocument.rewrittenText}
            />
            <footer>
              <button
                onClick={() => {
                  void handleCopy(activeDocument.rewrittenText);
                }}
                type="button"
              >
                <Copy size={16} /> Copy
              </button>
              <button onClick={handleExport} type="button">
                <Download size={16} /> Export <ChevronDown size={14} />
              </button>
            </footer>
          </article>
        </section>

        <section className="meta-row">
          <span>Last rewritten: Today, 10:24 AM</span>
          <button
            onClick={() => setDetailsOpen((value) => !value)}
            type="button"
          >
            View rewrite details <ChevronDown size={14} />
          </button>
        </section>

        {detailsOpen ? (
          <pre className="debug-panel">
            {JSON.stringify(
              activeDocument.debug ?? { status: 'No rewrite run yet' },
              null,
              2,
            )}
          </pre>
        ) : null}
      </main>
    </div>
  );
}
