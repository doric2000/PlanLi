'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { ROOT, PROJECT, assertLocalEnvironment } = require('./environment');
const { LOCAL_APP_CHECK_TOKEN } = require('../../client/src/config/localEmulators');
const fromFunctions = createRequire(path.join(ROOT, 'functions/package.json'));

async function commentSmoke() {
  assertLocalEnvironment();
  const admin = fromFunctions('firebase-admin');
  const app = admin.initializeApp({ projectId: PROJECT }, 'comment-smoke');
  const db = app.firestore();
  const uid = 'comment-smoke-admin';
  const { TERMS_VERSION, PRIVACY_VERSION, PROFILE_DETAILS_VERSION } = fromFunctions('./authPolicy');
  const now = admin.firestore.Timestamp.now();
  // Unsigned identity tokens are supported only by the isolated Auth emulator.
  const token = (claims = {}) => {
    const seconds = Math.floor(Date.now() / 1000);
    const payload = { aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: uid, user_id: uid,
      iat: seconds, exp: seconds + 3600, auth_time: seconds - 3600, email_verified: true, admin: true,
      firebase: { sign_in_provider: 'password', identities: {} }, ...claims };
    return `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
  };
  const call = async (name, data, claims = {}) => {
    const response = await fetch(`http://127.0.0.1:5001/${PROJECT}/europe-west1/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': LOCAL_APP_CHECK_TOKEN,
        Authorization: `Bearer ${token(claims)}` }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(60000),
    });
    const body = await response.json();
    if (body.error) throw Object.assign(new Error(body.error.message), body.error);
    assert.equal(response.ok, true);
    return body.result;
  };
  try {
    await app.auth().createUser({ uid, email: 'comment-smoke@example.test', emailVerified: true });
    await db.doc(`users/${uid}`).set({ status: 'active', displayName: 'Comment tester',
      onboarding: { profileDetailsVersion: PROFILE_DETAILS_VERSION, profileDetailsCompletedAt: now },
      legal: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: now },
      smartProfile: { setupRequired: false, completedAt: now, onboardingVersion: 2,
        interests: ['food'], budget: 'balanced', travelParties: ['solo'] } });
    await db.doc(`publicProfiles/${uid}`).set({ status: 'active', displayName: 'Comment tester' });
    await db.doc(`system/moderation/admins/${uid}`).set({ active: true });
    const fresh = { auth_time: Math.floor(Date.now() / 1000) };
    const elevated = { ...fresh, firebase: { sign_in_provider: 'password', identities: {}, sign_in_second_factor: 'totp' } };
    for (const [type, collection] of [['recommendation', 'recommendations'], ['route', 'routes']]) {
      await db.doc(`users/${uid}/serverState/rateLimits_comment`).delete();
      const target = { type, id: 'comment-smoke' };
      const parent = db.doc(`${collection}/${target.id}`);
      await parent.set({ ownerId: uid, title: 'Synthetic comment smoke', status: 'active',
        publicationGate: { destinationApprovalVerified: true }, stats: { commentCount: 0 } });
      const root = await call('saveComment', { target, text: 'בדיקה' });
      const reply = await call('saveComment', { target, text: 'תשובה', replyToCommentId: root.comment.id }, fresh);
      await call('saveComment', { target, text: 'בדיקה מעודכנת', commentId: root.comment.id });
      assert.equal((await parent.collection('comments').doc(root.comment.id).get()).data().text, 'בדיקה מעודכנת');
      await call('deleteComment', { target, commentId: reply.comment.id }, fresh);
      assert.equal((await parent.collection('comments').doc(reply.comment.id).get()).exists, false);
      await call('deleteComment', { target, commentId: reply.comment.id }); // Resume completed cleanup as its actor.
      await parent.collection('comments').doc('foreign').set({ authorId: 'someone-else', status: 'active', text: 'before' });
      for (const name of ['saveComment', 'deleteComment']) {
        const data = { target, commentId: 'foreign', ...(name === 'saveComment' ? { text: 'בדיקה' } : {}) };
        for (const [claims, reason] of [[{}, 'recent_sign_in_required'], [fresh, 'totp_required']]) {
          await assert.rejects(call(name, data, claims), (error) => error.details?.reason === reason);
        }
        await assert.rejects(call(name, data, { ...elevated, admin: false }), (error) => error.status === 'PERMISSION_DENIED');
        await db.doc(`system/moderation/admins/${uid}`).update({ active: false });
        await assert.rejects(call(name, data, elevated), (error) => error.status === 'PERMISSION_DENIED');
        await db.doc(`system/moderation/admins/${uid}`).update({ active: true });
        assert.equal((await parent.collection('comments').doc('foreign').get()).data().text, name === 'saveComment' ? 'before' : 'בדיקה');
        await call(name, data, elevated);
      }
      const nested = await call('saveComment', { target, text: 'תשובה נוספת', replyToCommentId: root.comment.id });
      await call('deleteComment', { target, commentId: root.comment.id });
      await call('deleteComment', { target, commentId: root.comment.id }); // Resume root deletion.
      assert.equal((await parent.collection('comments').doc(nested.comment.id).get()).exists, false);
      assert.equal((await parent.get()).data().stats.commentCount, 0);
      await assert.rejects(call('saveComment', { target, text: 'בדיקה' }, { email_verified: false }), (error) => Boolean(error.status));
    }
    await db.doc(`users/${uid}`).update({ status: 'suspended', moderation: { status: 'suspended' } });
    await assert.rejects(call('saveComment', { target: { type: 'route', id: 'comment-smoke' }, text: 'בדיקה' }), (error) => Boolean(error.status));
    console.log('PASS comment callables: recommendation/route creation, reply, own edit/delete, resumed cleanup, root cascade, fresh admin elevation, stale/missing TOTP rejection, inactive registry, unverified and suspended account rejection.');
  } finally { await app.delete(); }
}

if (require.main === module) commentSmoke().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { commentSmoke };
