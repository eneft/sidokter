'use strict';

function cleanString(value) {
  return String(value ?? '').trim();
}

function cleanDivision(value) {
  return cleanString(value).toUpperCase();
}

function parseStandardNumber(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const parts = raw
    .replace(/[-_]/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 4 && /^\d{4}$/.test(parts[3]) && /^\d{1,6}$/.test(parts[2])) {
    return {
      divisionCode: cleanDivision(parts[0]),
      subHierarchyCode: parts[1],
      sequenceNumber: Number(parts[2]),
      year: parts[3],
    };
  }
  if (parts.length === 3 && /^\d{4}$/.test(parts[2]) && /^\d{1,6}$/.test(parts[1])) {
    return {
      divisionCode: cleanDivision(parts[0]),
      subHierarchyCode: '',
      sequenceNumber: Number(parts[1]),
      year: parts[2],
    };
  }
  return null;
}

function getRecordYear(record) {
  const effective = cleanString(record?.effectiveDate);
  if (/^\d{4}/.test(effective)) return effective.slice(0, 4);
  const parsed = parseStandardNumber(record?.sopNumber);
  if (parsed?.year) return parsed.year;
  const created = cleanString(record?.createdAt);
  if (/^\d{4}/.test(created)) return created.slice(0, 4);
  return '';
}

function getRecordSequence(record) {
  const direct = Number(record?.sequenceNumber || 0);
  if (Number.isSafeInteger(direct) && direct > 0) return direct;
  const parsed = parseStandardNumber(record?.sopNumber);
  return Number.isSafeInteger(parsed?.sequenceNumber) && parsed.sequenceNumber > 0
    ? parsed.sequenceNumber
    : 0;
}

function isLegacy(record) {
  return record?.isLegacySop === true ||
    cleanString(record?.documentType).toUpperCase() === 'LAMA' ||
    cleanString(record?.jenis_spo).toUpperCase() === 'EKSISTING';
}

function isArchived(record) {
  return cleanString(record?.status).toUpperCase() === 'DIARSIPKAN';
}

function getScopeKey(year, divisionCode, subHierarchyCode) {
  return `${cleanString(year)}|${cleanDivision(divisionCode)}|${cleanString(subHierarchyCode) || 'ROOT'}`;
}

function canonicalReservationId(scopeKey, sequenceNumber) {
  return `sop-number-${encodeURIComponent(scopeKey)}-${sequenceNumber}`;
}

function formatNumber(divisionCode, subHierarchyCode, sequenceNumber, year) {
  const padded = String(sequenceNumber).padStart(3, '0');
  return cleanString(subHierarchyCode)
    ? `${cleanDivision(divisionCode)} / ${cleanString(subHierarchyCode)} / ${padded} / ${cleanString(year)}`
    : `${cleanDivision(divisionCode)} / ${padded} / ${cleanString(year)}`;
}

function safeTime(record) {
  const value = cleanString(record?.createdAt || record?.effectiveDate);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSequentialSyncPlan(sopsInput, reservationsInput) {
  const sops = Array.isArray(sopsInput) ? sopsInput : [];
  const reservations = Array.isArray(reservationsInput) ? reservationsInput : [];
  const scopes = new Map();
  const warnings = [];
  const allDocumentIds = new Set(
    sops
      .filter(Boolean)
      .map((record) => cleanString(record?.id))
      .filter(Boolean)
  );

  const ensureScope = (scopeKey, divisionCode, subHierarchyCode, year) => {
    if (!scopes.has(scopeKey)) {
      scopes.set(scopeKey, {
        scopeKey,
        divisionCode: cleanDivision(divisionCode),
        subHierarchyCode: cleanString(subHierarchyCode),
        year: cleanString(year),
        docs: [],
        reservations: [],
      });
    }
    return scopes.get(scopeKey);
  };

  for (const sop of sops) {
    if (!sop || isLegacy(sop) || sop.isNumberReservation) continue;
    const parsed = parseStandardNumber(sop.sopNumber);
    const divisionCode = cleanDivision(sop.divisionCode || parsed?.divisionCode);
    // Older standard SPO records can have an empty composite subHierarchyCode
    // even though the canonical SPO number (and/or component hierarchy fields)
    // already identifies the real hierarchy. Keep the server plan aligned with
    // the browser preview: blank is missing data, not an authoritative ROOT.
    const storedSubHierarchyCode = cleanString(sop.subHierarchyCode);
    const componentSubHierarchyCode = [
      cleanString(sop.subCode),
      cleanString(sop.instalasiCode || sop.instCode),
      cleanString(sop.poliCode),
      cleanString(sop.subUnitCode),
    ].filter(Boolean).join('.');
    const subHierarchyCode =
      storedSubHierarchyCode ||
      cleanString(parsed?.subHierarchyCode) ||
      componentSubHierarchyCode;
    const year = getRecordYear(sop);
    if (!divisionCode || divisionCode === 'ALL' || !/^\d{4}$/.test(year)) {
      warnings.push({ type: 'INVALID_SCOPE', documentId: sop.id, sopNumber: sop.sopNumber || '' });
      continue;
    }
    const scopeKey = getScopeKey(year, divisionCode, subHierarchyCode);
    ensureScope(scopeKey, divisionCode, subHierarchyCode, year).docs.push({ ...sop });
  }

  for (const reservation of reservations) {
    if (!reservation) continue;
    const divisionCode = cleanDivision(reservation.divisionCode);
    const subHierarchyCode = cleanString(reservation.subHierarchyCode);
    const year = cleanString(reservation.year);
    const sequenceNumber = Number(reservation.sequenceNumber || 0);
    if (!divisionCode || !/^\d{4}$/.test(year) || !Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) {
      warnings.push({ type: 'INVALID_RESERVATION', reservationId: reservation.id || '' });
      continue;
    }
    const scopeKey = getScopeKey(year, divisionCode, subHierarchyCode);
    ensureScope(scopeKey, divisionCode, subHierarchyCode, year).reservations.push({ ...reservation, sequenceNumber });
  }

  const resultScopes = [];
  const allChanges = [];
  let duplicateCount = 0;
  let lockedConflictCount = 0;

  for (const scope of scopes.values()) {
    const docs = scope.docs.slice();
    const reservationsForScope = scope.reservations.slice();
    const archivedDocIds = new Set(docs.filter(isArchived).map((doc) => String(doc.id || '')));

    const lockedOwners = new Map();
    const lockedSequences = new Set();
    const addLocked = (sequenceNumber, owner) => {
      if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) return;
      if (lockedOwners.has(sequenceNumber)) {
        lockedConflictCount += 1;
      } else {
        lockedOwners.set(sequenceNumber, owner);
      }
      lockedSequences.add(sequenceNumber);
    };

    for (const doc of docs.filter(isArchived)) {
      const sequenceNumber = getRecordSequence(doc);
      if (sequenceNumber > 0) addLocked(sequenceNumber, `ARCHIVED:${doc.id}`);
      else warnings.push({ type: 'INVALID_ARCHIVED_NUMBER', documentId: doc.id, sopNumber: doc.sopNumber || '' });
    }

    for (const reservation of reservationsForScope) {
      const usedDocumentId = cleanString(reservation.usedDocumentId);
      const status = cleanString(reservation.status).toUpperCase();

      // Only an active RESERVED number independently locks a slot. A USED claim
      // follows its document. If its document has already been deleted, the claim
      // is stale metadata and must NOT keep a numbering gap permanently occupied.
      if (status === 'RESERVED') {
        addLocked(Number(reservation.sequenceNumber), `RESERVED:${reservation.id}`);
        continue;
      }
      if (status === 'USED') {
        if (!usedDocumentId || !allDocumentIds.has(usedDocumentId)) {
          warnings.push({
            type: 'STALE_USED_RESERVATION',
            reservationId: cleanString(reservation.id),
            usedDocumentId,
            scopeKey: scope.scopeKey,
          });
        }
      }
    }

    const seenInitial = new Map();
    for (const doc of docs) {
      const sequenceNumber = getRecordSequence(doc);
      if (!(sequenceNumber > 0)) continue;
      const key = sequenceNumber;
      if (seenInitial.has(key)) duplicateCount += 1;
      else seenInitial.set(key, `DOC:${doc.id}`);
    }
    for (const reservation of reservationsForScope.filter((row) => cleanString(row.status).toUpperCase() === 'RESERVED')) {
      const sequenceNumber = Number(reservation.sequenceNumber || 0);
      if (!(sequenceNumber > 0)) continue;
      if (seenInitial.has(sequenceNumber)) duplicateCount += 1;
      else seenInitial.set(sequenceNumber, `RESERVED:${reservation.id}`);
    }

    const mutableDocs = docs.filter((doc) => !isArchived(doc)).sort((a, b) => {
      const aSeq = getRecordSequence(a) || Number.MAX_SAFE_INTEGER;
      const bSeq = getRecordSequence(b) || Number.MAX_SAFE_INTEGER;
      if (aSeq !== bSeq) return aSeq - bSeq;
      const aTime = safeTime(a);
      const bTime = safeTime(b);
      if (aTime !== bTime) return aTime - bTime;
      const titleCompare = cleanString(a.title).localeCompare(cleanString(b.title));
      if (titleCompare !== 0) return titleCompare;
      return cleanString(a.id).localeCompare(cleanString(b.id));
    });

    const assignedSequences = new Set();
    const finalDocuments = [];
    let candidate = 1;

    for (const doc of mutableDocs) {
      while (lockedSequences.has(candidate) || assignedSequences.has(candidate)) candidate += 1;
      const targetSequence = candidate;
      assignedSequences.add(targetSequence);
      candidate += 1;
      const newNumber = formatNumber(scope.divisionCode, scope.subHierarchyCode, targetSequence, scope.year);
      const oldSequence = getRecordSequence(doc);
      const oldNumber = cleanString(doc.sopNumber);
      const changed = oldSequence !== targetSequence || oldNumber !== newNumber;
      const finalDoc = {
        ...doc,
        sequenceNumber: targetSequence,
        sopNumber: newNumber,
        oldNumber,
        newNumber,
        changed,
      };
      finalDocuments.push(finalDoc);
      if (changed) {
        allChanges.push({
          id: doc.id,
          title: doc.title || '',
          status: doc.status || 'DRAFT',
          oldNumber: oldNumber || '-',
          newNumber,
          sequenceNumber: targetSequence,
          scopeKey: scope.scopeKey,
        });
      }
    }

    for (const doc of docs.filter(isArchived)) {
      const sequenceNumber = getRecordSequence(doc);
      finalDocuments.push({
        ...doc,
        sequenceNumber,
        oldNumber: cleanString(doc.sopNumber),
        newNumber: cleanString(doc.sopNumber),
        changed: false,
      });
    }

    const occupiedAfter = new Set([...lockedSequences, ...assignedSequences]);
    const lastSequence = occupiedAfter.size ? Math.max(...occupiedAfter) : 0;
    const reusableSequences = [];
    for (let seq = 1; seq <= lastSequence; seq += 1) {
      if (!occupiedAfter.has(seq)) reusableSequences.push(seq);
    }

    const desiredReservations = [];
    for (const doc of finalDocuments) {
      const sequenceNumber = Number(doc.sequenceNumber || 0);
      if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) continue;
      const existingClaim = reservationsForScope.find((row) =>
        cleanString(row.status).toUpperCase() === 'USED' && cleanString(row.usedDocumentId) === cleanString(doc.id)
      );
      desiredReservations.push({
        id: canonicalReservationId(scope.scopeKey, sequenceNumber),
        divisionCode: scope.divisionCode,
        subHierarchyCode: scope.subHierarchyCode,
        sequenceNumber,
        sopNumber: cleanString(doc.sopNumber),
        year: scope.year,
        title: cleanString(doc.title) || undefined,
        effectiveDate: cleanString(doc.effectiveDate) || undefined,
        reservedBy: cleanString(existingClaim?.reservedBy) || cleanString(doc.creatorName) || 'SIDOKTER',
        reservedAt: cleanString(existingClaim?.reservedAt) || cleanString(doc.createdAt) || new Date(0).toISOString(),
        status: 'USED',
        purpose: cleanString(existingClaim?.purpose) || 'SYSTEM_DOCUMENT',
        usedAt: cleanString(existingClaim?.usedAt) || cleanString(doc.updatedAt) || cleanString(doc.createdAt) || new Date(0).toISOString(),
        usedDocumentId: cleanString(doc.id),
        scopeKey: scope.scopeKey,
      });
    }

    resultScopes.push({
      ...scope,
      docs,
      reservations: reservationsForScope,
      finalDocuments,
      desiredReservations,
      lockedSequences: Array.from(lockedSequences).sort((a, b) => a - b),
      occupiedSequences: Array.from(occupiedAfter).sort((a, b) => a - b),
      lastSequence,
      reusableSequences,
      changedCount: finalDocuments.filter((doc) => doc.changed).length,
      archivedCount: archivedDocIds.size,
    });
  }

  return {
    scopes: resultScopes,
    changes: allChanges,
    changedCount: allChanges.length,
    duplicateCount,
    lockedConflictCount,
    warnings,
  };
}

module.exports = {
  cleanString,
  cleanDivision,
  parseStandardNumber,
  getRecordYear,
  getRecordSequence,
  getScopeKey,
  canonicalReservationId,
  formatNumber,
  isLegacy,
  isArchived,
  buildSequentialSyncPlan,
};
