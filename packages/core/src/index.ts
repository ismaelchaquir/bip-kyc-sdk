import axios, { AxiosInstance } from 'axios';

/**
 * Pluggable, platform-agnostic key/value storage used to persist the verification
 * session so a paused flow survives the app being closed.
 *
 * Inject a concrete implementation: AsyncStorage on React Native, or an adapter
 * around localStorage on web. Methods may be sync or async; results are awaited.
 */
export interface KYCStorage {
  /** Returns the stored value for a key, or null if absent */
  getItem(key: string): string | null | Promise<string | null>;
  /** Persists a value for a key */
  setItem(key: string, value: string): void | Promise<void>;
  /** Removes a stored key */
  removeItem(key: string): void | Promise<void>;
}

/**
 * The persisted verification session, used to resume an in-flight verification.
 */
export interface KYCSession {
  /** Identity ID owning the verification */
  identityId: string;
  /** Verification ID being completed */
  verificationId: string;
  /** External reference ID provided when starting (if any) */
  externalId?: string;
  /** Document type for the verification */
  documentType?: 'IDENTITY_CARD' | 'DRIVING_LICENSE';
}

/**
 * Credentials required to initialize the KYC SDK
 */
export interface KYCCredentials {
  /** API key for authentication */
  apiKey: string;
  /** Base URL of the KYC API */
  baseUrl: string;
  /**
   * Optional storage adapter. When provided, the SDK persists the verification
   * session on startVerification and reads it back to resume a paused flow.
   */
  storage?: KYCStorage;
}

/**
 * Parameters required to start a verification session
 */
export interface StartVerificationParams {
  /** Type of document to verify (e.g., IDENTITY_CARD, DRIVING_LICENSE) */
  documentType: 'IDENTITY_CARD' | 'DRIVING_LICENSE';
  /** Country code (e.g., MZ, AO, PT) */
  country: string;
  /** Optional existing identity ID to link verification to */
  identityId?: string;
  /** Optional external reference ID */
  externalId?: string;
}

export interface FaceMatchVerificationParams {
  /** The identity ID to perform face match on */
  identityId: string;
  /** Base64 encoded image data, data URI, or file:// URI */
  file: string;
  /** MIME type of the image (default: image/jpeg) */
  mimeType?: string;
}

export interface FaceMatchStatusParams {
  /** The identity ID to check face match status for */
  identityId: string;
  /** The face check ID from the face match verification response */
  faceCheckId: string;
  /** Polling interval in milliseconds (default: 3000) */
  interval?: number;
  /** Maximum time to wait in milliseconds (default: 120000) */
  timeout?: number;
}

/**
 * A capture the flow asks the applicant for. `liveness` replaces `selfie`
 * rather than adding to it: it is a selfie captured through a challenge.
 */
export type FlowStep = 'document' | 'selfie' | 'liveness' | 'proofOfAddress';

/** The named flows a project can be configured with. */
export type FlowPreset =
  | 'document_selfie'
  | 'document_liveness'
  | 'document_selfie_address'
  | 'document_liveness_address';

/**
 * The project's verification flow, as issued with the session.
 *
 * The server decides this, not the app: a flow requiring the liveness
 * challenge rejects a plain selfie, so a client that guessed would fail every
 * applicant.
 */
export interface VerificationFlow {
  /** Null for projects still on the pre-preset configuration. */
  preset: FlowPreset | null;
  steps: FlowStep[];
  locale: string;
}

/**
 * Response from starting a verification session
 */
export interface VerificationSession {
  /** Unique verification ID */
  verificationId: string;
  /** Linked identity ID (if exists) */
  identityId?: string;
  /** Current verification status */
  status: string;
  /**
   * The configured flow. Absent when talking to a gateway older than flow
   * presets — treat that as the plain selfie flow.
   */
  flow?: VerificationFlow;
}

/**
 * Whether the flow's face step must be captured through a liveness challenge.
 *
 * Defaults to false for a session with no flow, which is what an older gateway
 * returns and what its selfie endpoint expects.
 */
export function requiresLivenessChallenge(
  session: Pick<VerificationSession, 'flow'> | null | undefined
): boolean {
  return session?.flow?.steps.includes('liveness') ?? false;
}

/**
 * A head movement the applicant can be asked to perform during active liveness.
 */
export type LivenessAction = 'turn_left' | 'turn_right' | 'look_up' | 'look_down';

/**
 * A server-issued, single-use liveness challenge.
 *
 * The action sequence must come from the server — a client that picks its own
 * sequence provides no replay protection, since an attacker would simply choose
 * one matching a clip they already hold.
 */
export interface LivenessChallenge {
  /** Opaque challenge ID, submitted back with the selfie */
  id: string;
  /** The movements to prompt, in order */
  actions: LivenessAction[];
  /** ISO timestamp when the challenge was issued */
  issuedAt: string;
  /** ISO timestamp after which the challenge is rejected */
  expiresAt: string;
}

/**
 * The client's own account of how the challenge went.
 *
 * Advisory only. The server re-derives head pose from the submitted frames and
 * decides for itself; this is recorded for diagnostics, and a mismatch between
 * it and the frames is itself a useful fraud signal.
 */
export interface ClientChallengeReport {
  challengeId: string;
  actions: LivenessAction[];
  /** Per-action pass/fail as judged on-device, in prompt order */
  passed?: boolean[];
  /** Milliseconds from challenge start to each action being satisfied */
  timingsMs?: number[];
}

/** Active-liveness evidence submitted alongside the selfie. */
export interface LivenessEvidence {
  /** Frames captured while the challenge ran, in capture order */
  frames: string[];
  /** What the client believes happened; the challengeId is the load-bearing part */
  report: ClientChallengeReport;
}

/**
 * Parameters for uploading a selfie image
 */
export interface UploadSelfieParams {
  /** Verification ID to attach the selfie to */
  verificationId: string;
  /** Base64 encoded image data, data URI, or file:// URI (React Native) */
  imageData: string;
  /** MIME type of the image (default: image/jpeg) */
  mimeType?: string;
  /**
   * Optional active-liveness evidence. When omitted the server falls back to
   * the passive single-frame check, so existing callers are unaffected.
   */
  liveness?: LivenessEvidence;
}

/**
 * Parameters for uploading a document image
 */
export interface UploadDocumentParams {
  /** Verification ID to attach the document to */
  verificationId: string;
  /** Type of document (front or back) */
  type: 'front' | 'back';
  /** Base64 encoded image data, data URI, or file:// URI (React Native) */
  imageData: string;
  /** MIME type of the image (default: image/jpeg) */
  mimeType?: string;
}

/** Result of an upload operation */
export interface UploadResult {
  /** Response message */
  message: string;
  /** Current status after upload */
  status: string;
  /** True when the step was already uploaded and the call was a no-op */
  skipped?: boolean;
}

/**
 * Parameters for uploading a single verification step in a resume-aware way.
 */
export interface UploadStepParams {
  /** The step to upload */
  step: VerificationStep;
  /** Base64 encoded image data, data URI, or file:// URI (React Native) */
  imageData: string;
  /** Verification ID to attach to; falls back to the persisted session */
  verificationId?: string;
  /** Identity ID used to skip already-uploaded steps; falls back to the persisted session */
  identityId?: string;
  /** MIME type of the image (default: image/jpeg) */
  mimeType?: string;
  /**
   * Active-liveness evidence, used only when `step` is 'selfie'. Ignored for
   * document steps.
   */
  liveness?: LivenessEvidence;
}

/** Current status of a verification session */
export interface VerificationStatus {
  /** Verification ID */
  verificationId: string;
  /** Current status: PENDING, PROCESSING, APPROVED, or REJECTED */
  status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED';
  /** Face match similarity score (0-1) */
  faceMatchScore?: number;
  /** OCR extracted data from document */
  ocrData?: {
    /** Full name extracted from document */
    fullName?: string;
    /** ID number extracted from document */
    idNumber?: string;
    /** Birth date extracted from document */
    birthDate?: string;
    /** Expiry date extracted from document */
    expiryDate?: string;
    /** Additional extracted fields */
    [key: string]: any;
  };
  /** When the verification was created */
  createdAt: string;
  /** When the verification was last updated */
  updatedAt: string;
}

/** A single verification record as stored under an identity */
export interface VerificationRecord {
  /** Verification ID */
  id: string;
  /** Current verification status */
  status: string;
  /** External reference ID (if provided when starting) */
  externalId: string | null;
  /** Type of document being verified */
  documentType: 'IDENTITY_CARD' | 'DRIVING_LICENSE';
  /** Country code */
  country: string;
  /** Face match similarity score (0-1) */
  faceMatchScore: number | null;
  /** OCR extracted data from document */
  ocrData: Record<string, any> | null;
  /** Stored path of the uploaded selfie, or null if not uploaded yet */
  selfiePath: string | null;
  /** Stored path of the uploaded document front, or null if not uploaded yet */
  documentFrontPath: string | null;
  /** Stored path of the uploaded document back, or null if not uploaded yet */
  documentBackPath: string | null;
  /** Stored path of the document face crop, or null if not available */
  documentFacePath: string | null;
  /** Reason for rejection, if rejected */
  rejectionReason: string | null;
  /** Type of rejection, if rejected */
  rejectionType: string | null;
  /** When the verification was created */
  createdAt: string;
  /** When the verification was last updated */
  updatedAt: string;
}

/** An identity with its associated verifications */
export interface Identity {
  /** Unique identity ID */
  id: string;
  /** Verifications linked to this identity */
  verifications: VerificationRecord[];
  /** When the identity was created */
  createdAt: string;
  /** When the identity was last updated */
  updatedAt: string;
  /** Additional OCR / identity fields */
  [key: string]: any;
}

/** A single step a user must complete in a verification flow */
export type VerificationStep = 'selfie' | 'document_front' | 'document_back';

/** Computed progress of an in-flight verification, used to resume a paused flow */
export interface VerificationProgress {
  /** Verification ID the progress refers to */
  verificationId: string;
  /** Document type for this verification */
  documentType: 'IDENTITY_CARD' | 'DRIVING_LICENSE';
  /** Current verification status */
  status: string;
  /** Whether the selfie has already been uploaded */
  selfieUploaded: boolean;
  /** Whether the document front has already been uploaded */
  documentFrontUploaded: boolean;
  /** Whether the document back has already been uploaded (always false for single-sided docs) */
  documentBackUploaded: boolean;
  /** Steps still required to finish, in the order they should be collected */
  missingSteps: VerificationStep[];
  /** True when no steps remain to be uploaded */
  isComplete: boolean;
}

/** Event emitted when KYC status changes */
export interface KYCStatusEvent {
  /** Type of event: statusChanged or error */
  type: 'statusChanged' | 'error';
  /** New status (for statusChanged events) */
  status?: string;
  /** Error message (for error events) */
  error?: string;
}

/** Callback function for handling KYC status events */
export type KYCEventCallback = (event: KYCStatusEvent) => void;

/**
 * Custom error class for KYC SDK errors
 */
export class KYCSdkError extends Error {
  /** Error code for programmatic error handling */
  code: string;
  /** HTTP status code if available */
  statusCode?: number;

  /**
   * Creates a new KYC SDK error
   * @param message Human-readable error message
   * @param code Error code for handling
   * @param statusCode Optional HTTP status code
   */
  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'KYCSdkError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Core KYC SDK client for interacting with the verification API
 */
export class KYCCore {
  private client: AxiosInstance;
  private credentials: KYCCredentials;
  private eventCallbacks: KYCEventCallback[] = [];
  private storage?: KYCStorage;
  /**
   * Short-lived verification token issued by /verification/token. When present
   * it is sent as a Bearer header so the SDK also works in token-only mode
   * (the gateway accepts either the API key or the verification token).
   */
  private verificationToken: string | null = null;

  /** Storage key under which the active verification session is persisted */
  private static readonly SESSION_KEY = 'kyc:session';

  /**
   * Creates a new KYC Core instance
   * @param credentials API credentials (apiKey, baseUrl, and optional storage)
   */
  constructor(credentials: KYCCredentials) {
    this.credentials = credentials;
    this.storage = credentials.storage;
    this.client = axios.create({
      baseURL: credentials.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      config.headers['x-api-key'] = this.credentials.apiKey;
      if (this.verificationToken) {
        config.headers['Authorization'] = `Bearer ${this.verificationToken}`;
        config.headers['x-verification-token'] = this.verificationToken;
      }
      return config;
    });
  }

  /**
   * Persists the active verification session via the injected storage adapter.
   * No-op when no storage was provided.
   */
  private async saveSession(session: KYCSession): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.setItem(KYCCore.SESSION_KEY, JSON.stringify(session));
    } catch {
      // Persistence is best-effort; a storage failure must not break the flow.
    }
  }

  /**
   * Reads the persisted verification session, or null if none exists or no
   * storage adapter was provided.
   */
  async getSession(): Promise<KYCSession | null> {
    if (!this.storage) return null;
    try {
      const raw = await this.storage.getItem(KYCCore.SESSION_KEY);
      return raw ? (JSON.parse(raw) as KYCSession) : null;
    } catch {
      return null;
    }
  }

  /**
   * Clears the persisted verification session. Call this once a verification is
   * fully complete so the next flow starts fresh.
   */
  async clearSession(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.removeItem(KYCCore.SESSION_KEY);
    } catch {
      // Best-effort.
    }
  }

  /**
   * Registers a callback for KYC status events
   * @param callback Function to call when status changes
   * @returns Unsubscribe function to remove the callback
   */
  onEvent(callback: KYCEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Emits a status event to all registered callbacks
   * @param event The event to emit
   */
  private emitEvent(event: KYCStatusEvent): void {
    this.eventCallbacks.forEach((callback) => callback(event));
  }

  /**
   * Creates a verification token for secure API access
   * @param externalId External reference ID
   * @param expiry Token expiry in hours (default: 3)
   * @returns Object containing the token and its expiration time
   */
  async createVerificationToken(
    externalId: string,
    expiry: string = '3'
  ): Promise<{ token: string; expiresIn: string }> {
    try {
      const response = await this.client.post('/verification/token', {
        externalId,
        expiry,
      });

      // Store the token so subsequent requests authenticate as the applicant
      // (the gateway's VerificationTokenOrApiKeyGuard accepts either).
      this.verificationToken = response.data.token;

      return response.data;
    } catch (error: any) {
      const message =
        error.response?.data?.message || error.message || 'Failed to create verification token';
      throw new KYCSdkError(message, 'TOKEN_CREATE_FAILED', error.response?.status);
    }
  }

  /**
   * Starts a new verification session
   * @param params Parameters including documentType, country, identityId, and externalId
   * @returns Verification session with verificationId and status
   */
  async startVerification(params: StartVerificationParams): Promise<VerificationSession> {
    try {
      const response = await this.client.post('/verification/start', params);
      const session: VerificationSession = response.data;

      // Persist the session so the flow can be resumed after the app is closed.
      if (session.identityId && session.verificationId) {
        await this.saveSession({
          identityId: session.identityId,
          verificationId: session.verificationId,
          externalId: params.externalId,
          documentType: params.documentType,
        });
      }

      this.emitEvent({
        type: 'statusChanged',
        status: 'PENDING',
      });

      return response.data;
    } catch (error: any) {
      const message =
        error.response?.data?.message || error.message || 'Failed to start verification';
      throw new KYCSdkError(message, 'VERIFICATION_START_FAILED', error.response?.status);
    }
  }

  /**
   * Uploads a selfie image for face verification
   * @param params Parameters including verificationId, imageData, and optional mimeType
   * @returns Upload result with status
   */
  /**
   * Requests a fresh active-liveness challenge for a verification.
   *
   * Re-requesting replaces any outstanding challenge, so an applicant who
   * abandons the screen gets a new random sequence rather than being able to
   * retry until they draw one they have a recording for.
   */
  async createLivenessChallenge(verificationId: string): Promise<LivenessChallenge> {
    try {
      const response = await this.client.post('/verification/liveness/challenge', {
        verificationId,
      });
      return response.data;
    } catch (error: any) {
      const message =
        error.response?.data?.message || error.message || 'Failed to create liveness challenge';
      throw new KYCSdkError(message, 'LIVENESS_CHALLENGE_FAILED', error.response?.status);
    }
  }

  /**
   * Appends an image to a FormData under `field`, normalizing the three shapes
   * callers pass: a file:// URI, a data: URI, or raw base64.
   */
  private appendImage(
    formData: FormData,
    field: string,
    imageData: string,
    mimeType: string,
    name: string
  ): void {
    const uri =
      imageData.startsWith('file://') || imageData.startsWith('data:')
        ? imageData
        : `data:${mimeType};base64,${imageData}`;

    formData.append(field, { uri, type: mimeType, name } as any);
  }

  async uploadSelfie(params: UploadSelfieParams): Promise<UploadResult> {
    try {
      const formData = new FormData();
      formData.append('verificationId', params.verificationId);

      const mimeType = params.mimeType || 'image/jpeg';
      this.appendImage(formData, 'file', params.imageData, mimeType, 'selfie.jpg');

      if (params.liveness) {
        params.liveness.frames.forEach((frame, index) => {
          this.appendImage(formData, 'frames', frame, mimeType, `frame-${index}.jpg`);
        });
        formData.append('challengeReport', JSON.stringify(params.liveness.report));
      }

      const response = await this.client.post('/verification/upload/selfie', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      this.emitEvent({
        type: 'statusChanged',
        status: 'PROCESSING',
      });

      return response.data;
    } catch (error: any) {
      console.log('Upload selfie error:', error.response?.data || error.message);
      const message = error.response?.data?.message || error.message || 'Failed to upload selfie';
      throw new KYCSdkError(message, 'SELFIE_UPLOAD_FAILED', error.response?.status);
    }
  }

  /**
   * Uploads a document image (front or back)
   * @param params Parameters including verificationId, type, imageData, and optional mimeType
   * @returns Upload result with status
   */
  async uploadDocument(params: UploadDocumentParams): Promise<UploadResult> {
    try {
      const formData = new FormData();
      formData.append('verificationId', params.verificationId);
      formData.append('type', params.type);

      const mimeType = params.mimeType || 'image/jpeg';
      const imageData = params.imageData;

      if (imageData.startsWith('file://')) {
        formData.append('file', {
          uri: imageData,
          type: mimeType,
          name: `${params.type}.jpg`,
        } as any);
      } else if (imageData.startsWith('data:')) {
        formData.append('file', {
          uri: imageData,
          type: mimeType,
          name: `${params.type}.jpg`,
        } as any);
      } else {
        formData.append('file', {
          uri: `data:${mimeType};base64,${imageData}`,
          type: mimeType,
          name: `${params.type}.jpg`,
        } as any);
      }

      const response = await this.client.post('/verification/upload/document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      this.emitEvent({
        type: 'statusChanged',
        status: 'PROCESSING',
      });

      return response.data;
    } catch (error: any) {
      console.log('Upload document error:', error.response?.data || error.message);
      const message = error.response?.data?.message || error.message || 'Failed to upload document';
      throw new KYCSdkError(message, 'DOCUMENT_UPLOAD_FAILED', error.response?.status);
    }
  }

  /**
   * Gets the current status of a verification session
   * @param verificationId The verification ID to check
   * @returns Current verification status including OCR data and face match score
   */
  async getStatus(verificationId: string): Promise<VerificationStatus> {
    try {
      const response = await this.client.get(`/verification/status/${verificationId}`);

      this.emitEvent({
        type: 'statusChanged',
        status: response.data.status,
      });

      return response.data;
    } catch (error: any) {
      const message =
        error.response?.data?.message || error.message || 'Failed to get verification status';
      throw new KYCSdkError(message, 'STATUS_CHECK_FAILED', error.response?.status);
    }
  }

  /**
   * Fetches an identity along with all of its verification records.
   * @param identityId The identity ID to fetch
   * @returns The identity, including the verifications array with upload paths
   */
  async getIdentity(identityId: string): Promise<Identity> {
    try {
      const response = await this.client.get(`/identities/${identityId}`);
      return response.data;
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Failed to get identity';
      throw new KYCSdkError(message, 'IDENTITY_FETCH_FAILED', error.response?.status);
    }
  }

  /**
   * Returns the required steps for a given document type, in collection order.
   * ID cards require both sides; driving licenses are single-sided.
   */
  private getRequiredSteps(documentType: 'IDENTITY_CARD' | 'DRIVING_LICENSE'): VerificationStep[] {
    // Order is the collection order: documents first, selfie last. missingSteps
    // preserves this, so consumers can route to missingSteps[0] as "the next step".
    if (documentType === 'DRIVING_LICENSE') {
      return ['document_front', 'selfie'];
    }
    return ['document_front', 'document_back', 'selfie'];
  }

  /**
   * Computes which steps a user has already completed and which are still missing
   * for a verification, so a paused flow can be resumed without re-uploading.
   *
   * Both arguments are optional: when omitted they fall back to the persisted
   * session (see the storage adapter). Pass a verificationId to target a specific
   * verification; otherwise the most recently updated verification is used.
   *
   * @param identityId Identity ID owning the verification (defaults to the session)
   * @param verificationId Verification ID to target (defaults to the session)
   * @returns Progress describing uploaded steps and the steps still required
   */
  async getVerificationProgress(
    identityId?: string,
    verificationId?: string
  ): Promise<VerificationProgress> {
    const session = identityId && verificationId ? null : await this.getSession();
    const resolvedIdentityId = identityId ?? session?.identityId;
    const resolvedVerificationId = verificationId ?? session?.verificationId;

    if (!resolvedIdentityId) {
      throw new KYCSdkError(
        'No identityId provided and no persisted session found',
        'SESSION_NOT_FOUND',
        404
      );
    }

    const identity = await this.getIdentity(resolvedIdentityId);
    const verifications = identity.verifications ?? [];

    if (verifications.length === 0) {
      throw new KYCSdkError('No verifications found for identity', 'VERIFICATION_NOT_FOUND', 404);
    }

    const verification = resolvedVerificationId
      ? verifications.find((v) => v.id === resolvedVerificationId)
      : [...verifications].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];

    if (!verification) {
      throw new KYCSdkError(
        `Verification ${resolvedVerificationId} not found for identity`,
        'VERIFICATION_NOT_FOUND',
        404
      );
    }

    const selfieUploaded = !!verification.selfiePath;
    const documentFrontUploaded = !!verification.documentFrontPath;
    const documentBackUploaded = !!verification.documentBackPath;

    const uploaded: Record<VerificationStep, boolean> = {
      selfie: selfieUploaded,
      document_front: documentFrontUploaded,
      document_back: documentBackUploaded,
    };

    const missingSteps = this.getRequiredSteps(verification.documentType).filter(
      (step) => !uploaded[step]
    );

    return {
      verificationId: verification.id,
      documentType: verification.documentType,
      status: verification.status,
      selfieUploaded,
      documentFrontUploaded,
      documentBackUploaded,
      missingSteps,
      isComplete: missingSteps.length === 0,
    };
  }

  /**
   * Returns whether every required step of a verification has already been
   * uploaded (both document sides where applicable, plus the selfie).
   *
   * This is the reliable way to tell a user who has fully submitted their
   * documents (verification is now processing on the KYC backend) apart from one
   * who paused mid-flow with steps still missing — both look "PENDING" from the
   * outside. Derived purely from the identity's verification records.
   *
   * Returns `false` (rather than throwing) when the identity has no verification
   * records yet, so callers can treat "nothing uploaded" as "documents missing".
   *
   * @param identityId Identity ID owning the verification (defaults to the session)
   * @param verificationId Verification ID to target (defaults to the most recently updated)
   * @returns True when no steps remain to be uploaded
   */
  async hasAllDocuments(identityId?: string, verificationId?: string): Promise<boolean> {
    try {
      const progress = await this.getVerificationProgress(identityId, verificationId);
      return progress.isComplete;
    } catch (error) {
      // No identity / no verifications yet means nothing has been uploaded.
      if (
        error instanceof KYCSdkError &&
        (error.code === 'VERIFICATION_NOT_FOUND' || error.code === 'SESSION_NOT_FOUND')
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Uploads a single verification step (selfie, document front, or document back)
   * in a resume-aware way: it resolves the verification from the persisted session
   * when not given, and skips the upload if that step is already complete.
   *
   * @param params The step, image data, and optional verification/identity overrides
   * @returns The upload result; `skipped` is true when the step was already uploaded
   */
  async uploadStep(params: UploadStepParams): Promise<UploadResult> {
    const session = params.verificationId && params.identityId ? null : await this.getSession();
    const verificationId = params.verificationId ?? session?.verificationId;
    const identityId = params.identityId ?? session?.identityId;

    if (!verificationId) {
      throw new KYCSdkError(
        'No verificationId provided and no persisted session found',
        'SESSION_NOT_FOUND',
        404
      );
    }

    // Skip steps already uploaded so a resumed flow never re-sends data.
    // Requires an identityId (directly or from the session) to check progress.
    if (identityId) {
      const progress = await this.getVerificationProgress(identityId, verificationId);
      if (!progress.missingSteps.includes(params.step)) {
        return {
          message: `Step ${params.step} already uploaded`,
          status: progress.status,
          skipped: true,
        };
      }
    }

    if (params.step === 'selfie') {
      return this.uploadSelfie({
        verificationId,
        imageData: params.imageData,
        mimeType: params.mimeType,
        liveness: params.liveness,
      });
    }

    return this.uploadDocument({
      verificationId,
      type: params.step === 'document_front' ? 'front' : 'back',
      imageData: params.imageData,
      mimeType: params.mimeType,
    });
  }

  async faceMatchVerification(params: FaceMatchVerificationParams) {
    try {
      const formData = new FormData();

      const mimeType = params.mimeType || 'image/jpeg';
      const imageData = params.file;

      if (imageData.startsWith('file://')) {
        formData.append('file', {
          uri: imageData,
          type: mimeType,
          name: `selfie.jpg`,
        } as any);
      } else if (imageData.startsWith('data:')) {
        formData.append('file', {
          uri: imageData,
          type: mimeType,
          name: `selfie.jpg`,
        } as any);
      } else {
        formData.append('file', {
          uri: `data:${mimeType};base64,${imageData}`,
          type: mimeType,
          name: `selfie.jpg`,
        } as any);
      }

      const response = await this.client.post(
        `identities/${params.identityId}/face-match`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );
      return response.data;
    } catch (error: any) {
      console.log('Upload face match error:', error.response?.data || error.message);
      const message =
        error.response?.data?.message || error.message || 'Failed to upload face match';
      throw new KYCSdkError(message, 'FACEMATCH_UPLOAD_FAILED', error.response?.status);
    }
  }

  async faceMatchStatus({
    identityId,
    faceCheckId,
    interval = 3000,
    timeout = 120000,
  }: FaceMatchStatusParams): Promise<VerificationStatus> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = (
            await this.client.get(`identities/${identityId}/face-match/status/${faceCheckId}`)
          ).data;

          if (status.status === 'APPROVED' || status.status === 'REJECTED') {
            resolve(status);
            return;
          }

          if (Date.now() - startTime > timeout) {
            reject(new KYCSdkError('Polling timeout', 'POLLING_TIMEOUT'));
            return;
          }

          setTimeout(poll, interval);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Polls for verification status until completion or timeout
   * @param verificationId The verification ID to check
   * @param interval Polling interval in milliseconds (default: 3000)
   * @param timeout Maximum time to wait in milliseconds (default: 120000)
   * @returns Final verification status when approved or rejected
   */
  async pollStatus(
    verificationId: string,
    interval: number = 3000,
    timeout: number = 120000
  ): Promise<VerificationStatus> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getStatus(verificationId);

          if (status.status === 'APPROVED' || status.status === 'REJECTED') {
            resolve(status);
            return;
          }

          if (Date.now() - startTime > timeout) {
            reject(new KYCSdkError('Polling timeout', 'POLLING_TIMEOUT'));
            return;
          }

          setTimeout(poll, interval);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Static factory method to create a KYC client instance
   * @param credentials API credentials (apiKey and baseUrl)
   * @returns Configured KYCCore instance
   */
  static createClient(credentials: KYCCredentials): KYCCore {
    return new KYCCore(credentials);
  }
}

/**
 * Factory function to create a KYC client instance
 * @param credentials API credentials (apiKey and baseUrl)
 * @returns Configured KYCCore instance
 */
export function createKYCClient(credentials: KYCCredentials): KYCCore {
  return KYCCore.createClient(credentials);
}
