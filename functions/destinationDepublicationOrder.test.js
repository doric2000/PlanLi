const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'destinationAdminService.js'), 'utf8');

function functionBody(name, endMarker) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(endMarker, start + 1);
  assert.ok(start >= 0 && end > start, `${name} source boundary is missing`);
  return source.slice(start, end);
}

test('destination deactivation holds linked content before applying inactive policy', () => {
  const body = functionBody('deactivateDestination', '\nmodule.exports =');
  const holdAt = body.indexOf('await holdLinkedDestinationContent');
  assert.ok(holdAt > 0);
  const beforeHold = body.slice(0, holdAt);
  const afterHold = body.slice(holdAt);
  assert.doesNotMatch(beforeHold, /status:\s*['"]inactive['"]/);
  assert.doesNotMatch(beforeHold, /approved:\s*false/);
  assert.match(beforeHold, /publicationFence:\s*\{[\s\S]*state:\s*['"]draining['"]/);
  assert.match(afterHold, /status:\s*['"]inactive['"]/);
  assert.match(afterHold, /approved:\s*false/);
});

test('policy deapproval drains linked content before replacing canonicalPolicy', () => {
  const body = functionBody('updateDestinationPolicy', '\nasync function previewDestinationReassignment');
  const holdAt = body.indexOf('await holdLinkedDestinationContent');
  assert.ok(holdAt > 0);
  assert.doesNotMatch(body.slice(0, holdAt), /canonicalPolicy:\s*policy/);
  assert.match(body.slice(holdAt), /canonicalPolicy:\s*policy/);
});
