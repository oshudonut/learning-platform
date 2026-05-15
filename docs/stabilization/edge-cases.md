# Edge Cases

Edge cases across every feature that are not currently handled or have undefined behavior.

---

## Upload Pipeline

### EDGE-1: PDF with no extractable text and failing OCR
**Trigger**: User uploads a scanned PDF with very low image quality. `extractPdfText()` returns < 200 chars. `ocrPdfWithVision()` throws (e.g., Claude returns "no text" or the API times out).
**Behavior**: Route returns 422 with "Could not extract text. Try re-scanning at higher resolution..." — correct user-facing error.
**Gap**: The temp file is left orphaned in storage (see upload-pipeline-audit EDGE: orphaned files).

### EDGE-2: DOCX with no paragraphs (empty body)
**Trigger**: User uploads a DOCX file that contains only images, tables with no text, or formatting-only content.
**Behavior**: `mammoth.extractRawText()` returns `result.value = ""` or very short strings. Route checks `text.length < 50` and returns 422 with "Could not extract text from DOCX file."
**Gap**: The threshold of 50 chars may pass for a DOCX with a single word repeated — it will be stored but be useless for any generation.

### EDGE-3: Image with no readable text
**Trigger**: User uploads a photo (PNG/JPG) of a blank page, a photograph of scenery, etc.
**Behavior**: `ocrImageWithVision()` calls Claude with the image. Claude returns an empty or near-empty response. The returned text is used as-is — no length check before `saveDocument`.
**Gap**: A document with 0-10 characters of text gets saved to the DB. Any subsequent reviewer/quiz/flashcard generation receives nearly empty document text and will either generate garbage or fail Zod validation.

### EDGE-4: File exactly at 25 MB limit
**Trigger**: User uploads a file that is exactly 25,000,000 bytes (< MAX_BYTES = 26,214,400).
**Behavior**: Passes the size check. Proceeds normally.
**Gap**: None. This is handled correctly.

### EDGE-5: Duplicate file upload (same content, same user)
**Trigger**: User uploads the same PDF twice.
**Behavior**: `computeContentHash(text)` produces the same hash. `getDocumentByContentHash(hash, userId)` finds the existing document. Route... does not actually check for duplicates in the current upload route. The `getDocumentByContentHash` function exists in `lib/store.ts` but the upload route (`app/api/upload/route.ts`) does not call it. A duplicate file creates a new document with a new ID.
**Gap**: Duplicate documents are not detected at upload time. The unique index `documents_user_content_hash_uidx` (from `security_hardening_migration.sql`) would prevent duplicate hash+userId rows at the DB level — but the upload route doesn't check first, so it would hit a DB constraint violation (500 error) rather than returning a "you already uploaded this" message.

---

## Reviewer Generation

### EDGE-6: Document with very short text (< 500 chars)
**Trigger**: User uploads an image of a business card or a very short reference card. Text extraction produces 200 chars.
**Behavior**: `compressDocumentForReview(doc.text, 4000)` returns the full text (it's under the cap). Claude generates a reviewer from minimal content. The `ReviewerSchema.min(3)` validator requires at least 3 topics. Claude may fail to generate 3 distinct topics from a 200-char source.
**Gap**: Zod validation failure → 500 error with raw Claude output in the message. No graceful degradation.

### EDGE-7: Reviewer generation for a document with no learning method set
**Behavior**: Falls back to `REVIEWER_TASK` (standard schema). This is handled correctly — the method/mode fallback chain is: request body → progression → undefined → standard schema.

### EDGE-8: `force: true` with an adaptive reviewer schema
**Trigger**: User generated a "Feynman" conceptual reviewer, then changes their method to "Active Recall" and force-regenerates.
**Behavior**: A new reviewer with a different schema type is generated and stored in `doc.reviewer`. The `doc.reviewer` field is typed as `AnyReviewer` (union type). The `ReviewerView.tsx` component correctly switches rendering based on `reviewer.type`. This should work.
**Gap**: Old checkpoint flashcards were generated from topics in the previous reviewer format. If the new reviewer has different topics (different titles/structure), the checkpoint flashcards are now topic-mismatched but not invalidated. They remain in `checkpoint_flashcards` table with the old checkpoint_index.

---

## Quiz Generation

### EDGE-9: Document with only 1 section (1-topic reviewer)
**Trigger**: User uploads a very short document. Reviewer generates with the minimum of 3 topics (enforced by Zod). But `buildInitialProgression` creates 5 checkpoints — each checkpoint expects 20% of total sections. With 3 sections: checkpoint 0 = sections 0 (0.6 sections, ceil = 1), checkpoint 1 = sections 0-1 (1.2 sections, ceil = 2), etc.
**Gap**: With 3 total sections, `getSectionsForCheckpoint(4, 3)` = sections from `getCheckpointThreshold(3,3)=3` to `getCheckpointThreshold(4,3)=3` — an empty range. Checkpoints 3 and 4 have `sectionsCovered = []`. The checkpoint challenge for these empty checkpoints would generate flashcards from 0 topics. `buildCheckpointFlashcardTask([], method)` would produce: "Focus ONLY on content from these sections: " (empty list). Claude would likely generate generic flashcards or fail.

### EDGE-10: Quiz unlock with fewer than 5 completed checkpoints
**Trigger**: A document with 3 sections only has 3 non-empty checkpoint slots (checkpoints 0-2 cover something; 3-4 are empty). `isQuizUnlockEligible` checks `allSections && flashcardChallengeCompleted`. It does not check that all 5 checkpoints are completed — it only checks that `flashcardChallengeCompleted = true`. But `flashcardChallengeCompleted` is set by `complete_flashcard_challenge` action, which is triggered after completing the last checkpoint. If checkpoints 3 and 4 have no sections to cover, the user may never be prompted to complete them, and `flashcardChallengeCompleted` remains false indefinitely — blocking quiz unlock.
**Gap**: The checkpoint system was designed for documents with exactly 5×20% sections. Short documents break the gating math.

---

## Checkpoint Flashcards

### EDGE-11: Fewer than 5 topics covered at a checkpoint
**Trigger**: A document's first checkpoint covers only 1 topic (e.g., a 6-topic document where checkpoint 0 = sections 0 only, covered = 1 topic).
**Behavior**: `buildCheckpointFlashcardTask(["Topic 1"], method)` asks for 5-8 cards from 1 topic. Claude must generate 5-8 flashcards from a single reviewer topic's JSON. This is possible but produces repetitive cards.
**Gap**: The minimum card count (5) may not be achievable without repetition for very narrow topic coverage.

### EDGE-12: Checkpoint index out of bounds
**Trigger**: Client sends `checkpointIndex: 99` to the generate action.
**Behavior**: `progression.checkpointStatuses` is an array of 5 items. `progression.checkpointStatuses[99]` is `undefined`. `const coveredIndices = cp?.sectionsCovered ?? []` handles the undefined via optional chaining. `coveredTopics = []`. Task instruction has an empty topic list. Claude generates unknown content.
**Gap**: No server-side validation of `checkpointIndex` range.

---

## Flashcards and SM-2

### EDGE-13: SM-2 with no review history (first session)
**Trigger**: User opens flashcard study for the first time on a document.
**Behavior**: `initStates(cards)` creates fresh states with `interval=1, easeFactor=2.5, repetitions=0, nextReview=Date.now()`. All cards are due immediately. SM-2 algorithm runs correctly on first quality rating. This is expected behavior.

### EDGE-14: SM-2 with quality = 0 (complete failure) repeatedly
**Trigger**: User keeps rating all cards as "Again" (quality 0).
**Behavior**: `sm2(state, 0)` sets `newInterval = 1` and `repetitions = 0` (resets). Cards stay perpetually at interval 1. `newEase = Math.max(1.3, 2.5 + 0.1 - 5*(0.08 + 5*0.02)) = Math.max(1.3, 2.5 - 1.7) = Math.max(1.3, 0.8) = 1.3`. Ease factor floors at 1.3 and stays there.
**Gap**: None — this is correct SM-2 behavior. The floor at 1.3 is the standard SM-2 minimum.

### EDGE-15: Flashcard session started with 0 cards
**Trigger**: `doc.flashcards` is set but empty (`[]`). This could happen if Claude returned and validated an empty array (unlikely given `FlashcardsSchema` has no min constraint).
**Behavior**: `FlashcardStudy` component receives an empty `flashcards` prop. `initStates([])` returns `[]`. The study session renders with no cards. The UI likely shows a blank or crashes depending on how QuizEngine handles empty state.
**Gap**: No minimum card count enforced at the Zod schema level (`FlashcardsSchema` allows an empty `cards` array).

---

## AI Tutor

### EDGE-16: Tutor on a document with no text chunks
**Trigger**: `saveChunks` failed during upload (DB error), so `doc.chunks` is null/empty. User opens tutor on this document.
**Behavior**: `retrieveContext(doc.text, message, 3000)` is called with `doc.text`. If `doc.text` is populated (text was saved even if chunks failed), retrieval works from `doc.text`. The chunks are only used for tutor context retrieval if the tutor route were to use them — but the current tutor route uses `doc.text`, not `doc.chunks`. So this is handled correctly by accident.
**Gap**: None visible, but the tutor and chunk retrieval are using different data sources. Thesis-scale documents with truncated `doc.text` but full `doc.chunks` would get degraded tutor context.

### EDGE-17: Tutor called without a `documentId`
**Trigger**: User accesses the standalone tutor page (not document-scoped).
**Behavior**: `documentId` is `undefined`. The `if (documentId)` guard is checked — if false, `systemPrompt = TUTOR_SYSTEM` (generic tutor with no document context). This is correct and intended.

### EDGE-18: Tutor with a `conversationId` that belongs to another user
**Trigger**: User A guesses User B's conversation ID and sends a message referencing it.
**Behavior**: `getConversation(conversationId, user.id)` — this correctly filters by `user_id` (line 268 in `lib/store.ts`). Returns null. `convId = randomId()` — a new conversation is created for User A. User B's conversation is not compromised.
**Gap**: None — this is handled correctly.

---

## Progression System

### EDGE-19: `rebuildSectionStatuses` called on a document with 0 sections
**Trigger**: Reviewer was generated but has 0 topics (shouldn't happen due to Zod min(3), but if DB is manually modified or RLS bypass occurs).
**Behavior**: `buildInitialProgression(documentId, 0)` creates an empty `sectionStatuses` array. `checkpointStatuses` has 5 items, each with `sectionsCovered = getSectionsForCheckpoint(i, 0)` = empty ranges. All 5 checkpoints have empty coverage. The user is permanently stuck — no sections to complete, quiz unlock requires `allSections = true` (vacuously true) AND `flashcardChallengeCompleted`. The quiz might unlock immediately with no sections and no checkpoints.
**Gap**: Edge case that should not occur in practice but has undefined behavior.

### EDGE-20: Two `complete_section` calls for the same section index simultaneously
**Trigger**: Network retry causes the client to send `complete_section` twice for sectionIndex=3.
**Behavior**: Both calls hit `getProgression` and get the same state. Both find `section.completed = false` and set it to `true`. Both call `upsertProgression`. The second write overwrites the first — but since both are writing `completed = true` for the same section, the net result is idempotent. Checkpoints and quiz unlock are also idempotent in this case.
**Gap**: Idempotent in this specific scenario, but the underlying race condition (C3) is still present for non-idempotent writes.

---

## Export

### EDGE-21: Export on a document with an adaptive reviewer schema
**Trigger**: User has a Feynman (conceptual) reviewer and passes the quiz. Clicks DOCX export.
**Behavior**: `buildDocx(doc, doc.reviewer as Reviewer)` casts the reviewer to `Reviewer` (standard schema). The `ConceptualReviewer` schema has different fields (`analogy`, `simplifiedExplanation`, `mechanism`, `selfCheck`) — none of which appear in the `Reviewer` type. The `buildDocx` function iterates `reviewer.topics` and accesses `topic.coreIdea`, `topic.keyPoints`, etc. For a conceptual reviewer, these fields don't exist — they'll be `undefined`.
**Gap**: The DOCX export only works correctly for standard-schema reviewers. Adaptive reviewer schemas produce empty/broken DOCX exports. This is a silent correctness failure — the DOCX is generated without error but with empty sections.
