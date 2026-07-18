export type SegmentType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'blockquote'
  | 'code'
  | 'raw';

export type Segment = {
  id: string;
  index: number;
  type: SegmentType;
  originalText: string;
};

export type StyleProfile = {
  id: string;
  name: string;
  description: string;
  rules: string[];
  antiRules: string[];
};

export type VoiceExample = {
  id: string;
  text: string;
  label?: string;
  createdAt: string;
};

export type VoicePreferenceDimension =
  | 'directness'
  | 'warmth'
  | 'formality'
  | 'concision'
  | 'rhythm'
  | 'vocabulary'
  | 'explanation-shape'
  | 'custom';

export type VoicePreference = {
  id: string;
  dimension: VoicePreferenceDimension;
  instruction: string;
  avoidInstruction?: string;
  status: 'tentative' | 'confirmed' | 'user-set';
  confidence: 'low' | 'medium' | 'high';
  source: 'coach' | 'fine-tune' | 'edit-suggestion' | 'manual';
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type VoicePreferenceEvidence = {
  id: string;
  questionId: string;
  sourceText: string;
  candidateA?: string;
  candidateB?: string;
  selected: 'a' | 'b' | 'tie' | 'neither' | 'custom';
  customText?: string;
  dimension: VoicePreferenceDimension;
  createdAt: string;
};

export type VoiceCalibrationProof = {
  sourceText: string;
  candidateA: string;
  candidateB: string;
  candidateAType: 'prior' | 'tuned';
  selected?: 'a' | 'b' | 'tie' | 'neither';
  meaningChanged?: boolean;
  createdAt: string;
};

export type VoiceCalibrationSession = {
  id: string;
  voiceProfileId: string;
  mode: 'coach' | 'fine-tune';
  status: 'active' | 'review' | 'completed' | 'abandoned';
  focus?: VoicePreferenceDimension;
  questionIds: string[];
  evidenceIds: string[];
  currentIndex: number;
  baseline: StyleProfile;
  generatedComparisons?: AdaptiveVoiceComparisonResponse[];
  proof?: VoiceCalibrationProof;
  startedAt: string;
  completedAt?: string;
};

export type AdaptiveVoiceComparisonRequest = {
  sourceText: string;
  dimension: VoicePreferenceDimension;
  preservedDetails: string[];
  voice: StyleProfile;
  provider: ModelProviderSettings;
};

export type AdaptiveVoiceComparisonResponse = {
  id: string;
  source: 'generated';
  promptVersion: 1;
  dimension: VoicePreferenceDimension;
  sourceText: string;
  candidateA: {
    text: string;
    instruction: string;
    avoidInstruction?: string;
  };
  candidateB: {
    text: string;
    instruction: string;
    avoidInstruction?: string;
  };
  preservedDetails: string[];
  meaningCheck: {
    candidateA: boolean;
    candidateB: boolean;
    risks: string[];
  };
};

export type VoiceProfileRecord = StyleProfile & {
  examples: VoiceExample[];
  manualRules: string[];
  manualAntiRules: string[];
  preferences: VoicePreference[];
  preferenceEvidence: VoicePreferenceEvidence[];
  calibrationSessions: VoiceCalibrationSession[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  isStarter?: boolean;
};

export type RewriteInput = {
  originalParagraph: string;
  styleProfile: StyleProfile;
  referenceExamples: string[];
  previousFeedback?: string;
};

export type RewriteOutput = {
  rewrittenText: string;
};

export type MeaningRepresentation = {
  claims: string[];
  caveats: string[];
  constraints: string[];
  examples: string[];
  conclusions: string[];
  mandatoryDetails: string[];
};

export type StyleTargets = {
  directness: 'low' | 'medium' | 'high';
  formality: 'low' | 'medium' | 'high';
  paragraphLength: 'short' | 'medium' | 'long';
  explanationPattern: string;
  usesExamples: boolean;
  hedgingLevel: 'low' | 'medium' | 'high';
  tone: string[];
  vocabulary: string[];
};

export type StyleGrade = {
  overall: number;
  directness: number;
  vocabularyMatch: number;
  sentenceRhythm: number;
  toneMatch: number;
  paragraphShape: number;
  explanationStyle: number;
  issues: string[];
  revisionInstruction: string;
  pass: boolean;
};

export type MeaningCheck = {
  pass: boolean;
  missingDetails: string[];
  addedClaims: string[];
  changedMeaning: string[];
  riskLevel: 'low' | 'medium' | 'high';
  repairInstruction?: string;
};

export type RewriteAttempt = {
  iteration: number;
  rewrittenText: string;
  grade: StyleGrade;
  revisionInstruction?: string;
};

export type SegmentResult = {
  originalText: string;
  finalText: string;
  meaningRepresentation?: MeaningRepresentation;
  styleTargets?: StyleTargets;
  selectedReferenceExamples: string[];
  attempts: RewriteAttempt[];
  meaningCheck: MeaningCheck;
  warnings: string[];
};

export type FinalSmoothingOutput = {
  document: string;
};

export type ModelProviderSettings = {
  baseUrl: string;
  model?: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
};

export type ProviderKind =
  | 'lmstudio'
  | 'ollama'
  | 'openai'
  | 'openrouter'
  | 'litellm'
  | 'custom';

export type ProviderProfile = ModelProviderSettings & {
  id: string;
  name: string;
  kind: ProviderKind;
};

export type ProviderErrorKind =
  | 'unreachable'
  | 'authentication'
  | 'model-missing'
  | 'timeout'
  | 'invalid-json'
  | 'empty-completion'
  | 'rate-limit'
  | 'unknown';

export type ProviderCapabilityStatus = {
  providerFingerprint: string;
  endpointReachable: boolean;
  modelDiscovery: 'supported' | 'unsupported' | 'failed';
  selectedModel?: string;
  selectedModelAvailable: boolean;
  structuredOutput: 'verified' | 'unverified' | 'failed';
  rewriteReady: boolean;
  availableModels: string[];
  checkedAt: string;
  error?: {
    kind: ProviderErrorKind;
    message: string;
  };
};

export type PipelineOptions = {
  includeDebug?: boolean;
  styleThreshold?: number;
  finalSmoothing?: boolean;
  maxRewriteIterations?: number;
  runMeaningCheck?: boolean;
};

export type RewriteStage =
  | 'queued'
  | 'extracting-meaning'
  | 'analysing-style'
  | 'rewriting'
  | 'grading-style'
  | 'checking-meaning'
  | 'repairing-meaning'
  | 'assembling'
  | 'complete';

export type RewriteProgress = {
  runId: string;
  stage: RewriteStage;
  segmentIndex: number;
  segmentCount: number;
  attempt: number;
  message: string;
};

export type RewriteVersion = {
  acceptedAt?: string;
  id: string;
  runId: string;
  generatedText: string;
  editedText: string;
  providerId: string;
  model: string;
  voiceProfileId: string;
  voiceSnapshot?: VoiceProfileRecord;
  quality: {
    meaning: 'passed' | 'failed' | 'not-checked';
    styleScore?: number;
    warnings: string[];
    preservedDetails: string[];
    risks: string[];
  };
  createdAt: string;
};

export type PipelineRequest = {
  document: string;
  styleProfile: StyleProfile;
  referenceExamples: string[];
  provider: ModelProviderSettings;
  options?: PipelineOptions;
};

export type PipelineResult = {
  content: string;
  model: string;
  wordCount: {
    original: number;
    rewritten: number;
  };
  warnings: string[];
  segments: Array<{
    id: string;
    type: Segment['type'];
    originalText: string;
    finalText: string;
    rewritten: boolean;
  }>;
  debug?: {
    segmentResults: SegmentResult[];
    finalSmoothing?: FinalSmoothingOutput;
    diagnostics?: {
      runId: string;
      elapsedMs: number;
      modelCalls: number;
      stageLatencyMs: Partial<Record<RewriteStage, number>>;
    };
  };
};

export type RewriteApiRequest = {
  document: string;
  runId?: string;
  styleProfile?: StyleProfile;
  referenceExamples?: string[];
  provider?: Partial<ModelProviderSettings>;
  options?: PipelineOptions;
};

export type RewriteApiResponse = PipelineResult;

export type EvalRewriteRequest = {
  source: string;
  styleProfileId: string;
  providerId?: string;
  model?: string;
  options?: {
    maxRewriteIterations?: number;
    reasoningEffort?: ModelProviderSettings['reasoningEffort'];
    runMeaningCheck?: boolean;
    runFinalSmoothing?: boolean;
  };
};

export type EvalRewriteResponse = {
  finalText: string;
  debug: {
    provider: string;
    model: string;
    timings: {
      totalMs: number;
    };
    segments: Array<{
      index: number;
      type: Segment['type'];
      originalText: string;
      finalText: string;
      attempts: Array<{
        rewrittenText: string;
        styleScore?: number;
        feedback?: string;
      }>;
      meaningCheck?: {
        pass: boolean;
        missingDetails: string[];
        addedClaims: string[];
        changedMeaning: string[];
      };
    }>;
  };
};

export type DocumentRecord = {
  id: string;
  title: string;
  originalText: string;
  rewrittenText: string;
  createdAt: string;
  updatedAt: string;
  styleProfile: StyleProfile;
  voiceProfileId?: string;
  provider: ModelProviderSettings;
  debug?: PipelineResult['debug'];
  warnings: string[];
  versions?: RewriteVersion[];
  selectedVersionId?: string;
  schemaVersion?: number;
  trashedAt?: string;
};

export type AppBackup = {
  schemaVersion: 2;
  exportedAt: string;
  documents: DocumentRecord[];
  voices: VoiceProfileRecord[];
};

export type ContentStoreSnapshot = {
  schemaVersion: 2;
  updatedAt: string;
  documents: DocumentRecord[];
  voices: VoiceProfileRecord[];
};

export type ModelInfo = {
  id: string;
  selected: boolean;
};
