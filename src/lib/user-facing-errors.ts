export const USER_FACING = {
  generic:
    "Something went wrong. Please try again or contact us at EquiFormApp@gmail.com if the problem continues.",
  payment:
    "Something went wrong with your purchase. Please try again or contact support at EquiFormApp@gmail.com.",
  upload:
    "We had trouble uploading your photo. Please try again with a JPG, PNG, or WEBP file under 10MB.",
  uploadProfile:
    "We had trouble uploading your photo. Please try again with a JPG, PNG, or WEBP file under 5MB.",
  saveReport:
    "We couldn't save your report. Your credit was returned. Please try again.",
  saveReportNoRefund:
    "We couldn't save your report and your credit could not be returned. Please contact support at EquiFormApp@gmail.com.",
  analysisPhoto:
    "We couldn't analyze this photo. Please try again with a clear photo of just the horse — no people, fences, or obstructions in the frame.",
  highDemand:
    "We're experiencing high demand right now. Please try again in a moment.",
  pdf: "We couldn't generate your PDF. Please try again from My Reports.",
  pdfUnavailable: "We couldn't generate a PDF for this report. Please try again later.",
  mesh3d:
    "We couldn't finish your 3D model. Your written report is still available — you can download your PDF without the 3D view.",
  auth: "Something went wrong signing in. Please try again.",
  contact:
    "We couldn't send your message. Please try again or email us at EquiFormApp@gmail.com.",
  signInRequired: "Please sign in to continue.",
  breedRequired: "Breed is required.",
  reportNotFound: "We couldn't find that report.",
  loadProfile:
    "We couldn't load your profile. Please refresh the page and try again.",
  saveProfile: "We couldn't save your profile. Please try again.",
  noCreditsAccount:
    "No report credits were found for your account. Please contact support at EquiFormApp@gmail.com.",
  insufficientSingleView:
    "You don't have any single-view report credits left. Please buy more credits to continue.",
  insufficientSingleView3d:
    "You don't have any single-view report credits with 3D left. Please buy more credits to continue.",
  insufficientFullReport:
    "You don't have any four-view report credits left. Please buy more credits to continue.",
  insufficientFullReport3d:
    "You don't have any four-view report credits with 3D left. Please buy more credits to continue.",
} as const;

const DEV_MESSAGE_REPLACEMENTS: Record<string, string> = {
  "Invalid request body": USER_FACING.generic,
  "Invalid JSON body": USER_FACING.generic,
  "Authentication required": USER_FACING.signInRequired,
  "Authentication required for analysis": USER_FACING.signInRequired,
  Unauthorized: USER_FACING.signInRequired,
  "Missing photo URL": USER_FACING.upload,
  "Invalid photo URL": USER_FACING.upload,
  "Failed to fetch photo": USER_FACING.upload,
  "Photo is empty": USER_FACING.upload,
  "Could not read image dimensions": USER_FACING.upload,
  "Empty report response from vision model": USER_FACING.analysisPhoto,
  "Analysis failed": USER_FACING.analysisPhoto,
  "Full report analysis failed": USER_FACING.analysisPhoto,
  "Stripe is not configured": USER_FACING.payment,
  "App URL is not configured": USER_FACING.payment,
  "Failed to create checkout session": USER_FACING.payment,
  "packId is required": USER_FACING.payment,
  "userId is required": USER_FACING.payment,
  "priceId is required": USER_FACING.payment,
  "Invalid packId": USER_FACING.payment,
  "Invalid priceId": USER_FACING.payment,
  "Anthropic API key is not configured": USER_FACING.generic,
  "Failed to deduct analysis credit.": USER_FACING.generic,
  "Meshy API key is not configured": USER_FACING.mesh3d,
  "Failed to fetch Meshy task status": USER_FACING.mesh3d,
  "Missing taskId": USER_FACING.mesh3d,
  "Meshy task succeeded but no GLB URL was returned": USER_FACING.mesh3d,
  "Failed to store 3D model": USER_FACING.mesh3d,
  "3D model generation failed": USER_FACING.mesh3d,
  "Failed to check Meshy task status": USER_FACING.mesh3d,
  "Failed to check 3D model status": USER_FACING.mesh3d,
  "reportId is required": USER_FACING.generic,
  "report is required": USER_FACING.generic,
  "User email is required": USER_FACING.generic,
  "Failed to load report": USER_FACING.generic,
  "Report not found": USER_FACING.reportNotFound,
  "PDF generation failed": USER_FACING.pdf,
  "PDF generation failed. Please try again.": USER_FACING.pdf,
  "Server configuration error": USER_FACING.generic,
  "Email service is not configured": USER_FACING.contact,
  "Failed to send message": USER_FACING.contact,
  "Failed to load profile.": USER_FACING.loadProfile,
  "Failed to save profile.": USER_FACING.saveProfile,
  "Failed to upload profile photo.": USER_FACING.uploadProfile,
  "Unable to start checkout": USER_FACING.payment,
  "Unable to start checkout. Please try again.": USER_FACING.payment,
  "Unable to generate PDF for this report.": USER_FACING.pdfUnavailable,
};

const TECHNICAL_PATTERNS = [
  /json|parse|syntax|unexpected token|unterminated string|position \d+|at line \d+|column \d+|char(acter)? \d+|unexpected end/i,
  /\b(undefined|null|TypeError|ReferenceError|SyntaxError|stack trace)\b/i,
  /\b(API|endpoint|fetch failed|status code|HTTP)\b/i,
  /\b(500|502|503|504|529|400|401|403|404|429)\b/,
  /\b(Roboflow|Meshy|Anthropic|Stripe|Supabase|Resend)\b/i,
  /overloaded_error|rate_limit_error|api_error|internal_server_error/i,
  /\[object Object\]/,
  /^[\[{]/,
  /\.(ts|tsx|js|jsx):\d+/i,
  /\b(SQL|postgres|PGRST)\b/i,
  /invalid input|violates|constraint|duplicate key/i,
];

function isHighDemandMessage(message: string): boolean {
  return /overloaded_error|\boverloaded\b|\brate[_ ]?limit\b|\b529\b|high demand/i.test(
    message,
  );
}

function normalizeMessage(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value instanceof Error && value.message.trim()) {
    return value.message.trim();
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim();
    }
    if (record.error && typeof record.error === "object") {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim()) {
        return nested.message.trim();
      }
      if (typeof nested.type === "string" && nested.type.trim()) {
        return nested.type.trim();
      }
    }
    if (typeof record.type === "string" && record.type.trim()) {
      return record.type.trim();
    }
  }

  return "";
}

export function extractErrorMessage(value: unknown, fallback = ""): string {
  const message = normalizeMessage(value);
  return message || fallback;
}

function mapInsufficientCredits(message: string): string | null {
  if (/insufficient.*single view.*3d/i.test(message)) {
    return USER_FACING.insufficientSingleView3d;
  }
  if (/insufficient.*single view/i.test(message)) {
    return USER_FACING.insufficientSingleView;
  }
  if (/insufficient.*four-view.*3d/i.test(message)) {
    return USER_FACING.insufficientFullReport3d;
  }
  if (/insufficient.*full report/i.test(message)) {
    return USER_FACING.insufficientFullReport;
  }
  return null;
}

function mapSaveReportMessage(message: string): string | null {
  if (
    message.includes("could not be saved") &&
    message.includes("automatically returned")
  ) {
    return USER_FACING.saveReport;
  }
  if (
    message.includes("could not be saved") &&
    message.includes("could not be automatically returned")
  ) {
    return USER_FACING.saveReportNoRefund;
  }
  if (message === USER_FACING.saveReport || message === USER_FACING.saveReportNoRefund) {
    return message;
  }
  return null;
}

function mapAuthMessage(message: string): string | null {
  if (/invalid login credentials/i.test(message)) {
    return "Email or password is incorrect. Please try again.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Please confirm your email before signing in.";
  }
  if (/user already registered/i.test(message)) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (/password should be at least/i.test(message)) {
    return "Password must be at least 6 characters.";
  }
  if (/signup is disabled/i.test(message)) {
    return "Sign up is temporarily unavailable. Please try again later.";
  }
  return null;
}

export function isTechnicalErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return true;
  }

  if (DEV_MESSAGE_REPLACEMENTS[trimmed]) {
    return true;
  }

  if (trimmed.includes("view photo URL")) {
    return true;
  }
  if (/Failed to fetch .+ view image/i.test(trimmed)) {
    return true;
  }
  if (/view image is empty/i.test(trimmed)) {
    return true;
  }
  if (/Failed to upload .+ photo:/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("Failed to upload photo:")) {
    return true;
  }
  if (/Failed to (process|compress) image/i.test(trimmed)) {
    return true;
  }
  if (trimmed.includes("Report ID is missing")) {
    return true;
  }
  if (trimmed.includes("photos are missing")) {
    return true;
  }
  if (trimmed.includes("Invalid full report view data")) {
    return true;
  }

  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function categoryFallback(
  category: keyof typeof USER_FACING,
): string {
  return USER_FACING[category];
}

export function toUserFacingError(
  value: unknown,
  category: keyof typeof USER_FACING = "generic",
): string {
  const message = extractErrorMessage(value);
  if (!message) {
    return categoryFallback(category);
  }

  const exactReplacement = DEV_MESSAGE_REPLACEMENTS[message];
  if (exactReplacement) {
    return exactReplacement;
  }

  const insufficientCredits = mapInsufficientCredits(message);
  if (insufficientCredits) {
    return insufficientCredits;
  }

  const saveReport = mapSaveReportMessage(message);
  if (saveReport) {
    return saveReport;
  }

  const authMessage = mapAuthMessage(message);
  if (authMessage) {
    return authMessage;
  }

  if (isTechnicalErrorMessage(message)) {
    return categoryFallback(category);
  }

  return message;
}

export function formatAnalysisError(value: unknown): string {
  const message = extractErrorMessage(value);
  if (!message) {
    return USER_FACING.analysisPhoto;
  }

  if (message === USER_FACING.highDemand || isHighDemandMessage(message)) {
    return USER_FACING.highDemand;
  }

  // Never surface raw JSON / API payloads from Anthropic or upstream.
  if (
    /^[\[{]/.test(message.trim()) ||
    /"type"\s*:\s*"error"/i.test(message) ||
    /"overloaded_error"/i.test(message)
  ) {
    if (isHighDemandMessage(message)) {
      return USER_FACING.highDemand;
    }
    return USER_FACING.analysisPhoto;
  }

  const exactReplacement = DEV_MESSAGE_REPLACEMENTS[message];
  if (exactReplacement) {
    return exactReplacement;
  }

  const insufficientCredits = mapInsufficientCredits(message);
  if (insufficientCredits) {
    return insufficientCredits;
  }

  const saveReport = mapSaveReportMessage(message);
  if (saveReport) {
    return saveReport;
  }

  const preserved =
    message === "Upload a photo first." ||
    message === "Breed is required." ||
    message === "Upload all four photos before submitting." ||
    message === "Only JPG, PNG, and WEBP files are allowed." ||
    message === "File must be 10MB or smaller." ||
    message === "Sign in to upload photos for a full report." ||
    message === "Sign in to upload photos for analysis." ||
    message.startsWith("Your analysis was saved") ||
    message.includes("didn't meet the criteria") ||
    message.includes("photo guidelines") ||
    message.includes("couldn't analyze your") ||
    message.includes("landmarks") ||
    message.includes("same photo may have been used");

  if (preserved) {
    return message;
  }

  if (isTechnicalErrorMessage(message)) {
    if (isHighDemandMessage(message)) {
      return USER_FACING.highDemand;
    }
    return USER_FACING.analysisPhoto;
  }

  return message;
}

export function formatPaymentError(value: unknown): string {
  return toUserFacingError(value, "payment");
}

export function formatUploadError(
  value: unknown,
  profile = false,
): string {
  const message = extractErrorMessage(value);
  const preserved =
    message === "Only JPG, PNG, and WEBP images are allowed." ||
    message === "Only JPG, PNG, and WEBP files are allowed." ||
    message === "File must be 10MB or smaller." ||
    message === "Profile photo must be 5MB or smaller." ||
    message === "Sign in to upload photos for a full report." ||
    message === "Sign in to upload photos for analysis.";

  if (preserved) {
    return message;
  }

  if (!message || isTechnicalErrorMessage(message)) {
    return profile ? USER_FACING.uploadProfile : USER_FACING.upload;
  }

  return message;
}

export function formatPdfError(value: unknown): string {
  return toUserFacingError(value, "pdf");
}

export function formatMesh3DError(value: unknown): string {
  return toUserFacingError(value, "mesh3d");
}

export function formatAuthError(value: unknown): string {
  return toUserFacingError(value, "auth");
}

export function formatContactError(value: unknown): string {
  return toUserFacingError(value, "contact");
}

export function formatProfileError(
  value: unknown,
  action: "load" | "save" | "upload",
): string {
  const category =
    action === "load"
      ? "loadProfile"
      : action === "upload"
        ? "uploadProfile"
        : "saveProfile";
  return toUserFacingError(value, category);
}
