import {
  ArrowLeft,
  Check,
  FlaskConical,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  abandonCalibrationSession,
  CALIBRATION_PROOF_SOURCE,
  clearCalibrationProof,
  confirmCalibrationSession,
  getComparisonById,
  recordCalibrationChoice,
  recordCalibrationProofChoice,
  removeVoicePreference,
  replaceCurrentWithAdaptiveComparison,
  resetLearnedVoice,
  setCalibrationProof,
  startCalibrationSession,
  styleProfileWithTentativePreferences,
  updateVoicePreference,
  VOICE_DIMENSION_LABELS,
  type VoiceComparison,
} from '../../shared/styleLab';
import type {
  AdaptiveVoiceComparisonResponse,
  StyleProfile,
  VoiceCalibrationSession,
  VoicePreference,
  VoicePreferenceDimension,
  VoiceProfileRecord,
} from '../../shared/types';

const CORE_DIMENSIONS: VoicePreferenceDimension[] = [
  'directness',
  'warmth',
  'formality',
  'concision',
  'rhythm',
  'vocabulary',
  'explanation-shape',
];

const FOCUSABLE = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type ProofResult = {
  priorText: string;
  tunedText: string;
};

export function StyleLab(props: {
  onClose: () => void;
  onGenerateProof: (
    baseline: StyleProfile,
    tuned: StyleProfile,
    source: string,
  ) => Promise<ProofResult>;
  onGenerateAdaptive: (
    comparison: VoiceComparison,
    signal: AbortSignal,
  ) => Promise<AdaptiveVoiceComparisonResponse>;
  onUpdateVoice: (voice: VoiceProfileRecord) => void;
  providerReady: boolean;
  voice: VoiceProfileRecord;
}): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  const [fineTuneFocus, setFineTuneFocus] = useState<
    VoicePreferenceDimension | ''
  >('');
  const [customText, setCustomText] = useState('');
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState<string>();
  const [adaptiveBusy, setAdaptiveBusy] = useState(false);
  const [adaptiveError, setAdaptiveError] = useState<string>();
  const adaptiveAbortRef = useRef<AbortController | undefined>(undefined);
  const activeSession = useMemo(
    () =>
      [...props.voice.calibrationSessions]
        .reverse()
        .find(
          (session) =>
            session.status === 'active' || session.status === 'review',
        ),
    [props.voice.calibrationSessions],
  );

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = (): HTMLElement[] =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((element) => element.offsetParent !== null);
    const onKeyDown = (event: KeyboardEvent): void => {
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

    window.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    return () => {
      adaptiveAbortRef.current?.abort();
      window.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => previousFocus?.focus(), 0);
    };
  }, []);

  const currentQuestionId =
    activeSession?.questionIds[activeSession.currentIndex];
  const currentComparison = activeSession
    ? (activeSession.generatedComparisons?.find(
        (comparison) => comparison.id === currentQuestionId,
      ) ?? getComparisonById(currentQuestionId ?? ''))
    : undefined;
  const sessionEvidence = new Set(activeSession?.evidenceIds ?? []);
  const sessionPreferences = props.voice.preferences.filter(
    (preference) =>
      preference.status === 'tentative' &&
      preference.evidenceIds.some((id) => sessionEvidence.has(id)),
  );
  const learnedPreferences = props.voice.preferences.filter(
    (preference) => preference.status !== 'tentative',
  );

  const start = (
    mode: 'coach' | 'fine-tune',
    focus?: VoicePreferenceDimension,
  ): void => {
    setProofError(undefined);
    setCustomText('');
    props.onUpdateVoice(startCalibrationSession(props.voice, { focus, mode }));
  };

  const choose = (selected: 'a' | 'b' | 'tie' | 'neither' | 'custom'): void => {
    if (!activeSession || !currentComparison) return;
    if (selected === 'custom' && !customText.trim()) return;
    props.onUpdateVoice(
      recordCalibrationChoice(
        props.voice,
        activeSession.id,
        currentComparison,
        selected === 'custom'
          ? { customText: customText.trim(), selected }
          : { selected },
      ),
    );
    setCustomText('');
  };

  const generateProof = async (): Promise<void> => {
    if (!activeSession) return;
    setProofBusy(true);
    setProofError(undefined);

    try {
      const result = await props.onGenerateProof(
        activeSession.baseline,
        styleProfileWithTentativePreferences(props.voice),
        CALIBRATION_PROOF_SOURCE,
      );
      const priorFirst =
        crypto.getRandomValues(new Uint8Array(1))[0]! % 2 === 0;
      props.onUpdateVoice(
        setCalibrationProof(props.voice, activeSession.id, {
          candidateA: priorFirst ? result.priorText : result.tunedText,
          candidateAType: priorFirst ? 'prior' : 'tuned',
          candidateB: priorFirst ? result.tunedText : result.priorText,
          createdAt: new Date().toISOString(),
          sourceText: CALIBRATION_PROOF_SOURCE,
        }),
      );
    } catch (error) {
      setProofError(
        error instanceof Error
          ? error.message
          : 'The before-and-after comparison could not be generated.',
      );
    } finally {
      setProofBusy(false);
    }
  };

  const generateAdaptive = async (): Promise<void> => {
    if (!activeSession || !currentComparison) return;
    if (adaptiveBusy) {
      adaptiveAbortRef.current?.abort();
      adaptiveAbortRef.current = undefined;
      setAdaptiveBusy(false);
      setAdaptiveError(undefined);
      return;
    }
    const controller = new AbortController();
    adaptiveAbortRef.current = controller;
    setAdaptiveBusy(true);
    setAdaptiveError(undefined);

    try {
      const generated = await props.onGenerateAdaptive(
        currentComparison,
        controller.signal,
      );
      props.onUpdateVoice(
        replaceCurrentWithAdaptiveComparison(
          props.voice,
          activeSession.id,
          generated,
        ),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setAdaptiveError(
        error instanceof Error
          ? error.message
          : 'The adaptive comparison could not be generated.',
      );
    } finally {
      if (adaptiveAbortRef.current === controller) {
        adaptiveAbortRef.current = undefined;
        setAdaptiveBusy(false);
      }
    }
  };

  const saveSession = (): void => {
    if (!activeSession) return;
    const tentativeDimensions = new Set(
      sessionPreferences.map((preference) => preference.dimension),
    );
    const conflictsWithUserSet = props.voice.preferences.some(
      (preference) =>
        preference.status === 'user-set' &&
        tentativeDimensions.has(preference.dimension),
    );

    if (
      conflictsWithUserSet &&
      !window.confirm(
        'This calibration overlaps a preference you set manually. Save the new preference alongside your manual rule?',
      )
    ) {
      return;
    }
    props.onUpdateVoice(
      confirmCalibrationSession(props.voice, activeSession.id),
    );
  };

  const abandon = (): void => {
    if (!activeSession) return;
    props.onUpdateVoice(
      abandonCalibrationSession(props.voice, activeSession.id),
    );
  };

  return (
    <div className="style-lab-layer" role="presentation">
      <section
        aria-label="Style Lab"
        aria-modal="true"
        className="style-lab"
        ref={dialogRef}
        role="dialog"
      >
        <header className="style-lab-header">
          <div className="style-lab-title">
            {activeSession ? (
              <button aria-label="Leave calibration" onClick={abandon}>
                <ArrowLeft size={19} />
              </button>
            ) : (
              <span className="style-lab-mark">
                <FlaskConical size={20} />
              </span>
            )}
            <div>
              <span className="pane-kicker">Style Lab</span>
              <h1>
                {activeSession?.mode === 'fine-tune'
                  ? 'Fine-tune my voice'
                  : activeSession
                    ? 'Voice Coach'
                    : 'Teach StyleMakar your voice'}
              </h1>
            </div>
          </div>
          <div className="style-lab-header-meta">
            <span>
              <ShieldCheck size={16} /> Preferences stored locally
            </span>
            <button aria-label="Close Style Lab" onClick={props.onClose}>
              <X size={20} />
            </button>
          </div>
        </header>

        {!activeSession ? (
          <StyleLabHome
            fineTuneFocus={fineTuneFocus}
            learnedPreferences={learnedPreferences}
            onFineTuneFocus={setFineTuneFocus}
            onRemovePreference={(preference) =>
              props.onUpdateVoice(
                removeVoicePreference(props.voice, preference.id),
              )
            }
            onReset={() => {
              if (
                window.confirm(
                  'Reset learned preferences? Manual rules and examples will remain.',
                )
              ) {
                props.onUpdateVoice(resetLearnedVoice(props.voice));
              }
            }}
            onStartCoach={() => start('coach')}
            onStartFineTune={() =>
              start('fine-tune', fineTuneFocus || undefined)
            }
            onUpdatePreference={(preference, instruction) =>
              props.onUpdateVoice(
                updateVoicePreference(
                  props.voice,
                  preference.id,
                  {
                    avoidInstruction: preference.avoidInstruction,
                    instruction,
                  },
                  new Date().toISOString(),
                  true,
                ),
              )
            }
            voice={props.voice}
          />
        ) : activeSession.status === 'active' && currentComparison ? (
          <CalibrationQuestion
            adaptiveBusy={adaptiveBusy}
            adaptiveError={adaptiveError}
            adaptiveReady={props.providerReady}
            comparison={currentComparison}
            customText={customText}
            emergingPreferences={sessionPreferences}
            onChoose={choose}
            onCustomText={setCustomText}
            onGenerateAdaptive={() => void generateAdaptive()}
            session={activeSession}
          />
        ) : (
          <PreferenceReview
            onGenerateProof={() => void generateProof()}
            onProofChoice={(selected, meaningChanged) =>
              props.onUpdateVoice(
                recordCalibrationProofChoice(
                  props.voice,
                  activeSession.id,
                  selected,
                  meaningChanged,
                ),
              )
            }
            onRemovePreference={(preference) =>
              props.onUpdateVoice(
                clearCalibrationProof(
                  removeVoicePreference(props.voice, preference.id),
                  activeSession.id,
                ),
              )
            }
            onSave={saveSession}
            onUpdatePreference={(preference, instruction) =>
              props.onUpdateVoice(
                clearCalibrationProof(
                  updateVoicePreference(props.voice, preference.id, {
                    avoidInstruction: preference.avoidInstruction,
                    instruction,
                  }),
                  activeSession.id,
                ),
              )
            }
            preferences={sessionPreferences}
            proofBusy={proofBusy}
            proofError={proofError}
            providerReady={props.providerReady}
            session={activeSession}
          />
        )}
      </section>
    </div>
  );
}

function StyleLabHome(props: {
  fineTuneFocus: VoicePreferenceDimension | '';
  learnedPreferences: VoicePreference[];
  onFineTuneFocus: (value: VoicePreferenceDimension | '') => void;
  onRemovePreference: (preference: VoicePreference) => void;
  onReset: () => void;
  onStartCoach: () => void;
  onStartFineTune: () => void;
  onUpdatePreference: (
    preference: VoicePreference,
    instruction: string,
  ) => void;
  voice: VoiceProfileRecord;
}): ReactElement {
  const completedSessions = props.voice.calibrationSessions.filter(
    (session) => session.status === 'completed',
  );

  return (
    <main className="style-lab-home">
      <section className="style-lab-hero">
        <span className="style-lab-hero-icon">
          <Sparkles size={26} />
        </span>
        <div>
          <span className="pane-kicker">{props.voice.name}</span>
          <h2>
            {completedSessions.length > 0
              ? 'Keep shaping your voice'
              : 'Build a voice from real choices'}
          </h2>
          <p>
            Compare a few ways of saying the same thing. StyleMakar turns your
            choices into preferences you can inspect, change, or remove.
          </p>
        </div>
        <button className="style-lab-primary" onClick={props.onStartCoach}>
          <Sparkles size={18} />
          {completedSessions.length > 0
            ? 'Run Voice Coach again'
            : 'Start Voice Coach'}
        </button>
      </section>

      <section className="style-lab-home-grid">
        <div className="style-lab-card">
          <header>
            <div>
              <span className="pane-kicker">Focused calibration</span>
              <h3>Fine-tune my voice</h3>
            </div>
            <SlidersHorizontal size={21} />
          </header>
          <p>
            Isolate one quality or let StyleMakar choose an area that still
            needs stronger evidence.
          </p>
          <label>
            <span>Focus</span>
            <select
              aria-label="Fine-tune focus"
              onChange={(event) =>
                props.onFineTuneFocus(
                  event.target.value as VoicePreferenceDimension | '',
                )
              }
              value={props.fineTuneFocus}
            >
              <option value="">Surprise me</option>
              {CORE_DIMENSIONS.map((dimension) => (
                <option key={dimension} value={dimension}>
                  {VOICE_DIMENSION_LABELS[dimension]}
                </option>
              ))}
            </select>
          </label>
          <button onClick={props.onStartFineTune}>Fine-tune this voice</button>
        </div>

        <div className="style-lab-card style-lab-learned-card">
          <header>
            <div>
              <span className="pane-kicker">Your profile</span>
              <h3>Learned preferences</h3>
            </div>
            <span className="style-lab-count">
              {props.learnedPreferences.length}
            </span>
          </header>
          {props.learnedPreferences.length > 0 ? (
            <div className="style-lab-preference-list">
              {props.learnedPreferences.map((preference) => (
                <article key={preference.id}>
                  <div>
                    <strong>
                      {VOICE_DIMENSION_LABELS[preference.dimension]}
                    </strong>
                    <span>{preference.confidence} confidence</span>
                  </div>
                  <input
                    aria-label={`Edit ${VOICE_DIMENSION_LABELS[preference.dimension]} preference`}
                    onChange={(event) =>
                      props.onUpdatePreference(preference, event.target.value)
                    }
                    value={preference.instruction}
                  />
                  <button
                    aria-label={`Remove ${VOICE_DIMENSION_LABELS[preference.dimension]} preference`}
                    onClick={() => props.onRemovePreference(preference)}
                  >
                    Remove
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="style-lab-empty">
              <p>No learned preferences yet.</p>
              <span>Manual rules and examples remain active.</span>
            </div>
          )}
          {props.learnedPreferences.length > 0 ? (
            <button className="style-lab-reset" onClick={props.onReset}>
              <RotateCcw size={15} /> Reset learned preferences
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function CalibrationQuestion(props: {
  adaptiveBusy: boolean;
  adaptiveError?: string;
  adaptiveReady: boolean;
  comparison: VoiceComparison;
  customText: string;
  emergingPreferences: VoicePreference[];
  onChoose: (selected: 'a' | 'b' | 'tie' | 'neither' | 'custom') => void;
  onCustomText: (text: string) => void;
  onGenerateAdaptive: () => void;
  session: VoiceCalibrationSession;
}): ReactElement {
  const number = props.session.currentIndex + 1;
  const total = props.session.questionIds.length;

  return (
    <main className="style-lab-question-layout">
      <section className="style-lab-question">
        <header>
          <div>
            <h2>Which version sounds more like you?</h2>
            <p>Choose naturally. There is no correct answer.</p>
          </div>
          <div
            className="style-lab-progress"
            aria-label={`Question ${number} of ${total}`}
          >
            <span>
              {number} of {total}
            </span>
            <i
              style={
                {
                  '--progress': `${(number / total) * 100}%`,
                } as React.CSSProperties
              }
            />
          </div>
        </header>

        <article className="style-lab-source">
          <span className="pane-kicker">Source</span>
          <p>{props.comparison.sourceText}</p>
        </article>

        <div className="style-lab-adaptive-row">
          <span>
            {'source' in props.comparison &&
            props.comparison.source === 'generated'
              ? 'Adaptive pair generated and meaning-checked.'
              : 'Want an example tailored to this voice? It will be sent to your configured provider.'}
          </span>
          <button
            disabled={!props.adaptiveReady}
            onClick={props.onGenerateAdaptive}
          >
            <Sparkles size={15} />
            {props.adaptiveBusy
              ? 'Cancel adaptive example'
              : 'Try an adaptive example'}
          </button>
          {props.adaptiveError ? (
            <span role="alert">{props.adaptiveError}</span>
          ) : null}
        </div>

        <div className="style-lab-options">
          <button onClick={() => props.onChoose('a')} type="button">
            <span>A</span>
            <p>{props.comparison.candidateA.text}</p>
            <strong>Choose A</strong>
          </button>
          <button onClick={() => props.onChoose('b')} type="button">
            <span>B</span>
            <p>{props.comparison.candidateB.text}</p>
            <strong>Choose B</strong>
          </button>
        </div>

        <div className="style-lab-secondary-choices">
          <button onClick={() => props.onChoose('tie')}>Tie</button>
          <button onClick={() => props.onChoose('neither')}>Neither</button>
        </div>

        <details className="style-lab-custom-answer">
          <summary>Edit my own version</summary>
          <textarea
            aria-label="My preferred version"
            onChange={(event) => props.onCustomText(event.target.value)}
            placeholder="Write the version you would naturally use…"
            value={props.customText}
          />
          <button
            disabled={!props.customText.trim()}
            onClick={() => props.onChoose('custom')}
          >
            Use my version
          </button>
        </details>

        <div className="style-lab-meaning-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Meaning preserved</strong>
            <span>
              Both reviewed options keep:{' '}
              {props.comparison.preservedDetails.join(', ')}.
            </span>
          </div>
        </div>
      </section>

      <aside className="style-lab-emerging">
        <span className="pane-kicker">Your emerging voice</span>
        <h3>Still learning</h3>
        <p>Preferences remain tentative until you review them.</p>
        {props.emergingPreferences.length > 0 ? (
          props.emergingPreferences.map((preference) => (
            <article key={preference.id}>
              <span>{VOICE_DIMENSION_LABELS[preference.dimension]}</span>
              <strong>{preference.instruction}</strong>
              <small>{preference.confidence} confidence</small>
            </article>
          ))
        ) : (
          <div className="style-lab-empty">
            Your first choice will appear here.
          </div>
        )}
      </aside>
    </main>
  );
}

function PreferenceReview(props: {
  onGenerateProof: () => void;
  onProofChoice: (
    selected: 'a' | 'b' | 'tie' | 'neither',
    meaningChanged: boolean,
  ) => void;
  onRemovePreference: (preference: VoicePreference) => void;
  onSave: () => void;
  onUpdatePreference: (
    preference: VoicePreference,
    instruction: string,
  ) => void;
  preferences: VoicePreference[];
  proofBusy: boolean;
  proofError?: string;
  providerReady: boolean;
  session: VoiceCalibrationSession;
}): ReactElement {
  const proof = props.session.proof;
  const selectedType =
    proof?.selected === 'a'
      ? proof.candidateAType
      : proof?.selected === 'b'
        ? proof.candidateAType === 'prior'
          ? 'tuned'
          : 'prior'
        : proof?.selected;
  const tunedWon = selectedType === 'tuned' || selectedType === 'tie';

  return (
    <main className="style-lab-review">
      <section className="style-lab-review-main">
        <header>
          <span className="style-lab-complete-mark">
            <Check size={22} />
          </span>
          <div>
            <span className="pane-kicker">Review before saving</span>
            <h2>Does this sound like your voice?</h2>
            <p>Edit or remove any inference. Nothing is active yet.</p>
          </div>
        </header>

        <div className="style-lab-review-list">
          {props.preferences.map((preference) => (
            <article key={preference.id}>
              <div>
                <strong>{VOICE_DIMENSION_LABELS[preference.dimension]}</strong>
                <span>{preference.confidence} confidence</span>
              </div>
              <input
                aria-label={`${VOICE_DIMENSION_LABELS[preference.dimension]} preference`}
                onChange={(event) =>
                  props.onUpdatePreference(preference, event.target.value)
                }
                value={preference.instruction}
              />
              <button onClick={() => props.onRemovePreference(preference)}>
                Remove
              </button>
            </article>
          ))}
          {props.preferences.length === 0 ? (
            <div className="style-lab-empty">
              No rules were inferred. Custom wording will still be saved as a
              reference example.
            </div>
          ) : null}
        </div>

        {!proof ? (
          <div className="style-lab-proof-start">
            <div>
              <strong>See whether tuning helped</strong>
              <p>
                Compare the previous and proposed voices without seeing which is
                which.
              </p>
            </div>
            <button
              className="style-lab-primary"
              disabled={!props.providerReady || props.proofBusy}
              onClick={props.onGenerateProof}
            >
              <Sparkles size={17} />
              {props.proofBusy
                ? 'Generating comparison…'
                : 'Compare before saving'}
            </button>
            {!props.providerReady ? (
              <span>
                Connect a compatible provider to run the blind comparison.
              </span>
            ) : null}
            {props.proofError ? (
              <span role="alert">{props.proofError}</span>
            ) : null}
          </div>
        ) : (
          <div className="style-lab-proof">
            <article className="style-lab-source">
              <span className="pane-kicker">Comparison source</span>
              <p>{proof.sourceText}</p>
            </article>
            <h3>Which result would you rather use?</h3>
            <div className="style-lab-options">
              <button
                className={proof.selected === 'a' ? 'selected' : ''}
                onClick={() => props.onProofChoice('a', false)}
              >
                <span>A</span>
                <p>{proof.candidateA}</p>
                <strong>Choose A</strong>
              </button>
              <button
                className={proof.selected === 'b' ? 'selected' : ''}
                onClick={() => props.onProofChoice('b', false)}
              >
                <span>B</span>
                <p>{proof.candidateB}</p>
                <strong>Choose B</strong>
              </button>
            </div>
            <div className="style-lab-secondary-choices">
              <button onClick={() => props.onProofChoice('tie', false)}>
                Tie
              </button>
              <button onClick={() => props.onProofChoice('neither', false)}>
                Neither
              </button>
              <button onClick={() => props.onProofChoice('neither', true)}>
                Meaning changed
              </button>
            </div>
            {proof.selected ? (
              <div
                className={
                  tunedWon
                    ? 'style-lab-proof-result success'
                    : 'style-lab-proof-result'
                }
              >
                <strong>
                  {tunedWon
                    ? selectedType === 'tie'
                      ? 'The tuned voice matched the previous result.'
                      : 'You preferred the tuned voice.'
                    : selectedType === 'prior'
                      ? 'You preferred the previous voice.'
                      : 'Neither result was a clear improvement.'}
                </strong>
                <span>
                  {tunedWon
                    ? 'The proposed preferences are ready to save.'
                    : 'Keep these preferences under review or save them deliberately.'}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <aside className="style-lab-review-actions">
        <span className="pane-kicker">Next step</span>
        <h3>Use this voice</h3>
        <p>
          Saving compiles the reviewed preferences into the rules used by future
          rewrites.
        </p>
        <button
          className="style-lab-primary"
          disabled={Boolean(proof && (!proof.selected || proof.meaningChanged))}
          onClick={props.onSave}
        >
          {proof?.meaningChanged
            ? 'Meaning changed — do not save'
            : proof && !tunedWon
              ? 'Save preferences anyway'
              : 'Save tuned voice'}
        </button>
        {!proof ? (
          <button className="style-lab-secondary" onClick={props.onSave}>
            Save without comparison
          </button>
        ) : null}
        <small>
          You can fine-tune, edit, or reset every learned preference later.
        </small>
      </aside>
    </main>
  );
}
