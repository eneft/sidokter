'use strict';

const crypto = require('crypto');
const { initializeApp, getApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');

const FIRESTORE_DATABASE_ID = 'ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3';
const REGION = 'asia-southeast2';
const INTERNAL_MAIL_VERSION = 2;
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
let _db = null;

function ensureApp() {
  try {
    return getApp();
  } catch (error) {
    if (error?.code !== 'app/no-app') throw error;
    return initializeApp();
  }
}

function db() {
  if (!_db) {
    ensureApp();
    _db = getFirestore(FIRESTORE_DATABASE_ID);
  }
  return _db;
}

function clean(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return clean(value).replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}

function sanitizeId(value) {
  return clean(value).replace(/\//g, '_').slice(0, 150);
}

function workflowCategory(sop) {
  const kind = clean(sop?.jenis_spo || sop?.documentType).toUpperCase();
  if (kind === 'RIVIU' || kind === 'REVIEW' || sop?.isReviewDocument === true) return 'RIVIU';
  if (kind === 'EKSISTING' || kind === 'LAMA' || sop?.isLegacySop === true) return 'EKSISTING';
  return 'BARU';
}

function proposalCopy(sop) {
  const category = workflowCategory(sop);
  const actor = clean(sop?.activationRequestedBy || sop?.creatorName || 'Pengguna');
  const unit = clean(sop?.divisionName || sop?.divisionCode || 'Unit');
  const number = clean(sop?.sopNumber) || 'Draft';
  if (category === 'RIVIU') {
    return {
      title: 'Usulan Hasil Riviu SPO',
      message: `${actor} (${unit}) mengusulkan hasil riviu SPO “${clean(sop?.title)}” (${number}) untuk persetujuan Admin.`
    };
  }
  if (category === 'EKSISTING') {
    return {
      title: 'Usulan Aktivasi SPO Eksisting',
      message: `${actor} (${unit}) mengusulkan SPO Eksisting “${clean(sop?.title)}” (${number}) untuk persetujuan Admin.`
    };
  }
  return {
    title: 'Usulan Aktivasi SPO Baru',
    message: `${actor} (${unit}) mengusulkan SPO “${clean(sop?.title)}” (${number}) untuk persetujuan Admin.`
  };
}

function activationCopy(sop) {
  const category = workflowCategory(sop);
  const number = clean(sop?.sopNumber) || 'Resmi';
  if (category === 'RIVIU') {
    return {
      title: 'Hasil Riviu SPO Disetujui & Aktif',
      message: `Hasil riviu SPO “${clean(sop?.title)}” (${number}) telah diverifikasi dan diaktifkan oleh Admin.`
    };
  }
  if (category === 'EKSISTING') {
    return {
      title: 'SPO Eksisting Disetujui & Aktif',
      message: `SPO Eksisting “${clean(sop?.title)}” (${number}) telah disetujui dan diaktifkan oleh Admin.`
    };
  }
  return {
    title: 'SPO Disetujui & Aktif',
    message: `SPO “${clean(sop?.title)}” (${number}) telah disetujui dan diaktifkan oleh Admin.`
  };
}

function proposalEventKey(sopId, sop) {
  return `sop-activation-requested:${sopId}:${clean(sop?.activationRequestedAt) || 'draft'}`;
}

function activationEventKey(sopId, sop) {
  return `sop-activated:${sopId}:${clean(sop?.activatedAt) || 'active'}`;
}

function workflowThreadKey(sopId) {
  return `sop-workflow:${sopId}`;
}

function reviewThreadKey(sopId) {
  return `sop-review:${sopId}`;
}

function buildItem({
  eventKey,
  type,
  eventType,
  title,
  message,
  sop,
  sopId,
  actionable = false,
  actionLabel,
  threadKey,
  senderName = 'Sistem SIDOKTER',
  recipientUid,
  recipientName
}) {
  const id = sanitizeId(eventKey || `${eventType}-${crypto.randomUUID()}`);
  const timestamp = Date.now();
  return {
    id,
    type,
    eventType,
    title: clean(title).slice(0, 200),
    message: clean(message).slice(0, 2000),
    documentId: sopId,
    documentNumber: clean(sop?.sopNumber) || null,
    documentType: 'SPO',
    divisionCode: clean(sop?.divisionCode) || null,
    divisionName: clean(sop?.divisionName) || null,
    timestamp,
    read: false,
    hidden: false,
    actionable: Boolean(actionable),
    resolvedAt: null,
    resolvedReason: null,
    actionLabel: actionLabel || (actionable ? 'Buka Dokumen' : 'Buka Dokumen'),
    metadata: {
      eventKey: eventKey || id,
      eventType,
      threadKey,
      correlationId: threadKey,
      mailKind: 'system',
      senderName,
      recipientUid: recipientUid || null,
      recipientName: recipientName || null,
      documentTitle: clean(sop?.title),
      internalMailVersion: INTERNAL_MAIL_VERSION
    }
  };
}

async function getUser(uid) {
  const value = clean(uid);
  if (!value) return null;
  const snap = await db().collection('users').doc(value).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function getAdminUids() {
  const result = new Set();
  const [usersSnap, adminsSnap] = await Promise.all([
    db().collection('users').get(),
    db().collection('admins').get().catch(() => null)
  ]);
  usersSnap.docs.forEach((entry) => {
    const data = entry.data() || {};
    if (clean(data.role).toLowerCase() === 'admin') result.add(entry.id);
  });
  adminsSnap?.docs?.forEach((entry) => result.add(entry.id));
  return [...result];
}

async function resolveOwnerUid(sop) {
  for (const field of ['activationRequestedUid', 'creatorUid']) {
    const uid = clean(sop?.[field]);
    if (uid && await getUser(uid)) return uid;
  }

  const candidates = [
    ['activationRequestedByUsername', 'username'],
    ['activationRequestedUsername', 'username'],
    ['creatorUsername', 'username'],
    ['activationRequestedBy', 'name'],
    ['creatorName', 'name']
  ];
  const usersSnap = await db().collection('users').get();
  for (const [field, userField] of candidates) {
    const target = normalize(sop?.[field]);
    if (!target) continue;
    const matches = usersSnap.docs.filter((entry) => normalize(entry.data()?.[userField]) === target);
    if (matches.length === 1) return matches[0].id;
  }
  return null;
}

async function pruneOldTombstones(uid) {
  if (!uid) return;
  const snap = await db().collection('notifications').doc(uid).collection('items').get();
  const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
  const expired = snap.docs.filter((entry) => {
    const data = entry.data() || {};
    return data.hidden === true && Number(data.deletedAt || 0) > 0 && Number(data.deletedAt) < cutoff;
  });
  for (let offset = 0; offset < expired.length; offset += 400) {
    const batch = db().batch();
    expired.slice(offset, offset + 400).forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
}

async function writeMailboxItem(uid, item) {
  const targetUid = clean(uid);
  if (!targetUid || !item?.id) return;
  await db().collection('notifications').doc(targetUid).collection('items').doc(item.id).set(item, { merge: true });
  await pruneOldTombstones(targetUid);
}

async function resolveThreadForUid(uid, sopId, threadKey, reason) {
  const targetUid = clean(uid);
  if (!targetUid) return;
  const collection = db().collection('notifications').doc(targetUid).collection('items');
  const snap = await collection.get();
  const now = Date.now();
  const matches = snap.docs.filter((entry) => {
    const data = entry.data() || {};
    const candidateThread = clean(data.metadata?.threadKey || data.metadata?.correlationId);
    return data.hidden !== true
      && clean(data.documentId) === clean(sopId)
      && (candidateThread === threadKey || (!candidateThread && data.actionable === true));
  });
  for (let offset = 0; offset < matches.length; offset += 400) {
    const batch = db().batch();
    matches.slice(offset, offset + 400).forEach((entry) => {
      batch.set(entry.ref, {
        actionable: false,
        resolvedAt: now,
        resolvedReason: reason
      }, { merge: true });
    });
    await batch.commit();
  }
}

async function normalizeLatestReviewMessage(uid, sopId, reviewContext, eventType, actionable) {
  const targetUid = clean(uid);
  if (!targetUid) return;
  const collection = db().collection('notifications').doc(targetUid).collection('items');
  const snap = await collection.get();
  const candidates = snap.docs
    .filter((entry) => {
      const data = entry.data() || {};
      return data.hidden !== true
        && clean(data.documentId) === clean(sopId)
        && clean(data.metadata?.reviewContext) === reviewContext;
    })
    .sort((a, b) => Number(b.data()?.timestamp || 0) - Number(a.data()?.timestamp || 0));
  const target = candidates[0];
  if (!target) return;
  const threadKey = reviewThreadKey(sopId);
  await target.ref.set({
    eventType,
    actionable: Boolean(actionable),
    resolvedAt: null,
    resolvedReason: null,
    metadata: {
      ...(target.data()?.metadata || {}),
      eventType,
      threadKey,
      correlationId: threadKey,
      internalMailVersion: INTERNAL_MAIL_VERSION
    }
  }, { merge: true });
}

async function notifyProposal(after, sopId) {
  const admins = await getAdminUids();
  const copy = proposalCopy(after);
  const eventKey = proposalEventKey(sopId, after);
  const threadKey = workflowThreadKey(sopId);
  await Promise.all(admins.map(async (uid) => {
    const user = await getUser(uid);
    return writeMailboxItem(uid, buildItem({
      eventKey,
      type: 'proposal',
      eventType: 'SOP_ACTIVATION_REQUESTED',
      title: copy.title,
      message: copy.message,
      sop: after,
      sopId,
      actionable: true,
      actionLabel: 'Tinjau & Sahkan',
      threadKey,
      recipientUid: uid,
      recipientName: clean(user?.name || user?.username || 'Administrator')
    }));
  }));
}

async function notifyActivation(before, after, sopId) {
  const admins = await getAdminUids();
  const threadKey = workflowThreadKey(sopId);
  await Promise.all(admins.map((uid) => resolveThreadForUid(uid, sopId, threadKey, 'SPO telah diaktifkan.')));

  const ownerUid = await resolveOwnerUid(after);
  if (ownerUid) {
    const owner = await getUser(ownerUid);
    const copy = activationCopy(after);
    await writeMailboxItem(ownerUid, buildItem({
      eventKey: activationEventKey(sopId, after),
      type: 'activation',
      eventType: 'SOP_ACTIVATED',
      title: copy.title,
      message: copy.message,
      sop: after,
      sopId,
      actionable: false,
      actionLabel: 'Buka Dokumen',
      threadKey,
      recipientUid: ownerUid,
      recipientName: clean(owner?.name || owner?.username || 'Pengusul')
    }));
  }

  const authorized = [...new Set((Array.isArray(after?.authorizedUids) ? after.authorizedUids : []).map(clean).filter(Boolean))];
  const adminSet = new Set(admins);
  for (const uid of authorized) {
    if (uid === ownerUid || adminSet.has(uid)) continue;
    const user = await getUser(uid);
    if (!user || clean(user.role).toLowerCase() === 'admin') continue;
    const eventKey = `sop-assigned:${sopId}:${clean(after?.activatedAt) || 'active'}:${uid}`;
    await writeMailboxItem(uid, buildItem({
      eventKey,
      type: 'assignment',
      eventType: 'SOP_ASSIGNED',
      title: 'SPO Aktif untuk Unit Anda',
      message: `SPO “${clean(after?.title)}” (${clean(after?.sopNumber) || 'Resmi'}) telah aktif dan tersedia untuk unit Anda.`,
      sop: after,
      sopId,
      actionable: false,
      actionLabel: 'Buka Dokumen',
      threadKey,
      recipientUid: uid,
      recipientName: clean(user.name || user.username || 'Pengguna')
    }));
  }
}

async function handleReviewTransition(before, after, sopId) {
  const previous = clean(before?.reviewState);
  const next = clean(after?.reviewState);
  if (!next || next === previous) return;

  const ownerUid = await resolveOwnerUid(after);
  const requesterUid = clean(after?.currentReviewRequesterUid || before?.currentReviewRequesterUid);
  if (next === 'REVISION_REQUESTED') {
    await normalizeLatestReviewMessage(ownerUid, sopId, 'REVISION_REQUESTED', 'SOP_REVISION_REQUESTED', true);
    return;
  }
  if (next === 'REVISION_SUBMITTED') {
    await normalizeLatestReviewMessage(requesterUid, sopId, 'REVISION_SUBMITTED', 'SOP_REVISION_SUBMITTED', true);
    return;
  }
  if (next === 'VERIFIED') {
    const threadKey = reviewThreadKey(sopId);
    await Promise.all([
      resolveThreadForUid(ownerUid, sopId, threadKey, 'Perbaikan SPO telah diverifikasi.'),
      resolveThreadForUid(requesterUid, sopId, threadKey, 'Perbaikan SPO telah diverifikasi.')
    ]);
    if (ownerUid) {
      const owner = await getUser(ownerUid);
      const eventKey = `sop-verified:${sopId}:${clean(after?.reviewUpdatedAt) || Date.now()}`;
      await writeMailboxItem(ownerUid, buildItem({
        eventKey,
        type: 'review',
        eventType: 'SOP_VERIFIED',
        title: 'Perbaikan SPO Terverifikasi',
        message: `Perbaikan SPO “${clean(after?.title)}” (${clean(after?.sopNumber) || 'Draft'}) telah diverifikasi.`,
        sop: after,
        sopId,
        actionable: false,
        actionLabel: 'Buka Dokumen',
        threadKey,
        recipientUid: ownerUid,
        recipientName: clean(owner?.name || owner?.username || 'Pengusul')
      }));
    }
  }
}

function deriveSopMailboxEvents(before, after) {
  if (!after) return [];
  const events = [];
  const beforeStatus = clean(before?.status).toUpperCase();
  const afterStatus = clean(after?.status).toUpperCase();
  const beforeRequest = clean(before?.activationRequestedAt);
  const afterRequest = clean(after?.activationRequestedAt);
  if (afterStatus === 'DRAFT' && afterRequest && afterRequest !== beforeRequest) {
    events.push('SOP_ACTIVATION_REQUESTED');
  }
  if (afterStatus === 'AKTIF' && beforeStatus !== 'AKTIF') {
    events.push('SOP_ACTIVATED');
  }
  const beforeReview = clean(before?.reviewState);
  const afterReview = clean(after?.reviewState);
  if (afterReview && afterReview !== beforeReview) {
    if (afterReview === 'REVISION_REQUESTED') events.push('SOP_REVISION_REQUESTED');
    else if (afterReview === 'REVISION_SUBMITTED') events.push('SOP_REVISION_SUBMITTED');
    else if (afterReview === 'VERIFIED') events.push('SOP_VERIFIED');
  }
  return events;
}

async function processSopWrite(before, after, sopId) {
  if (!after) return;
  const events = deriveSopMailboxEvents(before, after);
  if (events.includes('SOP_ACTIVATION_REQUESTED')) await notifyProposal(after, sopId);
  if (events.includes('SOP_ACTIVATED')) await notifyActivation(before, after, sopId);
  if (events.some((eventType) => eventType.startsWith('SOP_REVISION_') || eventType === 'SOP_VERIFIED')) {
    await handleReviewTransition(before, after, sopId);
  }

  if (clean(after.status).toUpperCase() === 'DIARSIPKAN' && clean(before?.status).toUpperCase() !== 'DIARSIPKAN') {
    const admins = await getAdminUids();
    const ownerUid = await resolveOwnerUid(after);
    const requesterUid = clean(after?.currentReviewRequesterUid);
    await Promise.all([
      ...admins.map((uid) => resolveThreadForUid(uid, sopId, workflowThreadKey(sopId), 'SPO telah diarsipkan.')),
      resolveThreadForUid(ownerUid, sopId, reviewThreadKey(sopId), 'SPO telah diarsipkan.'),
      resolveThreadForUid(requesterUid, sopId, reviewThreadKey(sopId), 'SPO telah diarsipkan.')
    ]);
  }
}

const sopMailboxWorkflow = onDocumentWritten({
  document: 'sops/{sopId}',
  database: FIRESTORE_DATABASE_ID,
  region: REGION,
  retry: false
}, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  await processSopWrite(before, after, clean(event.params?.sopId));
});

const clearNotificationMailbox = onCall({ region: REGION, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = clean(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'Login diperlukan.');
  const collection = db().collection('notifications').doc(uid).collection('items');
  const snap = await collection.get();
  const now = Date.now();
  let hidden = 0;
  let deleted = 0;
  const cutoff = now - TOMBSTONE_RETENTION_MS;

  for (let offset = 0; offset < snap.docs.length; offset += 400) {
    const batch = db().batch();
    snap.docs.slice(offset, offset + 400).forEach((entry) => {
      const data = entry.data() || {};
      if (data.hidden === true && Number(data.deletedAt || 0) > 0 && Number(data.deletedAt) < cutoff) {
        batch.delete(entry.ref);
        deleted += 1;
      } else if (data.hidden !== true) {
        batch.set(entry.ref, { hidden: true, deletedAt: now }, { merge: true });
        hidden += 1;
      }
    });
    await batch.commit();
  }
  return { ok: true, hidden, deleted };
});

const createNotificationBlocked = onCall({ region: REGION, timeoutSeconds: 15, memory: '256MiB' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Login diperlukan.');
  throw new HttpsError('failed-precondition', 'Pembuatan Pesan SIDOKTER hanya dapat dilakukan oleh workflow backend.');
});

module.exports = {
  INTERNAL_MAIL_VERSION,
  TOMBSTONE_RETENTION_MS,
  deriveSopMailboxEvents,
  processSopWrite,
  sopMailboxWorkflow,
  clearNotificationMailbox,
  createNotificationBlocked
};
