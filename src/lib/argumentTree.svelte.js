import { getChunkByDisplayId, getChunkMap, setMarkdownSource } from './documentContext.svelte.js';

let tree = $state(null);
let status = $state('idle');
let error = $state(null);
let lastAnalyzedAt = $state(null);
let mutationVersion = $state(0);
let progressMessage = $state(null);

export function getArgumentTree() {
  return tree;
}

export function getArgumentStatus() {
  return status;
}

export function getArgumentError() {
  return error;
}

export function getLastAnalyzedAt() {
  return lastAnalyzedAt;
}

export function getMutationVersion() {
  return mutationVersion;
}

export function getProgressMessage() {
  return progressMessage;
}

export function setProgressMessage(msg) {
  progressMessage = msg && typeof msg === 'string' ? msg : null;
}

export function clearProgressMessage() {
  progressMessage = null;
}

function bumpVersion() {
  mutationVersion += 1;
}

export function setArgumentLoading() {
  status = 'loading';
  error = null;
  progressMessage = null;
}

export function setArgumentResult(nextTree) {
  tree = nextTree;
  status = 'ready';
  error = null;
  lastAnalyzedAt = Date.now();
  progressMessage = null;
  bumpVersion();
}

export function setArgumentError(message) {
  status = 'error';
  error = message;
  progressMessage = null;
}

export function clearArgumentTree() {
  tree = null;
  status = 'idle';
  error = null;
  lastAnalyzedAt = null;
  bumpVersion();
}

export function getArgumentTreeSnapshot() {
  if (!tree) return null;
  return {
    tree: JSON.parse(JSON.stringify(tree)),
    lastAnalyzedAt,
  };
}

export function restoreArgumentTreeSnapshot(snapshot) {
  if (!snapshot) {
    tree = null;
    status = 'idle';
    error = null;
    lastAnalyzedAt = null;
    bumpVersion();
    return;
  }
  tree = snapshot.tree || null;
  lastAnalyzedAt = snapshot.lastAnalyzedAt || null;
  status = tree ? 'ready' : 'idle';
  error = null;
  bumpVersion();
}

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const f = findNode(child, id);
    if (f) return f;
  }
  return null;
}

function findParent(node, id) {
  if (!node) return null;
  for (const child of node.children || []) {
    if (child.id === id) return node;
    const f = findParent(child, id);
    if (f) return f;
  }
  return null;
}

export function getNodeById(nodeId) {
  if (!tree || !nodeId) return null;
  return findNode(tree, nodeId);
}

export function getParentOf(nodeId) {
  if (!tree || !nodeId) return null;
  return findParent(tree, nodeId);
}

export function getSubtreeChunkIds(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) return [];
  const out = [];
  function walk(n) {
    if (Array.isArray(n.chunkIds)) out.push(...n.chunkIds);
    for (const c of n.children || []) walk(c);
  }
  walk(node);
  return out;
}

function isInSubtree(rootId, candidateId) {
  const root = getNodeById(rootId);
  if (!root) return false;
  return findNode(root, candidateId) !== null;
}

export function moveNode(nodeId, newParentId, beforeSiblingId = null) {
  if (!tree) return { ok: false, reason: 'No tree' };
  if (nodeId === tree.id) return { ok: false, reason: 'Cannot move root' };
  const node = getNodeById(nodeId);
  if (!node) return { ok: false, reason: 'Node not found' };
  const newParent = getNodeById(newParentId);
  if (!newParent) return { ok: false, reason: 'Target parent not found' };
  if (newParent.type === 'fact') return { ok: false, reason: 'Cannot drop onto a fact' };
  if (isInSubtree(nodeId, newParentId)) return { ok: false, reason: 'Cannot move into own subtree' };

  const oldParent = getParentOf(nodeId);
  if (!oldParent) return { ok: false, reason: 'No parent' };

  const oldIdx = oldParent.children.indexOf(node);
  if (oldIdx >= 0) oldParent.children.splice(oldIdx, 1);

  let insertIdx = newParent.children.length;
  if (beforeSiblingId) {
    const idx = newParent.children.findIndex((c) => c.id === beforeSiblingId);
    if (idx >= 0) insertIdx = idx;
  }
  newParent.children.splice(insertIdx, 0, node);
  node.parentId = newParent.id;

  bumpVersion();
  return { ok: true };
}

export function deleteNode(nodeId) {
  if (!tree) return { ok: false, reason: 'No tree' };
  if (nodeId === tree.id) return { ok: false, reason: 'Cannot delete root' };
  const node = getNodeById(nodeId);
  if (!node) return { ok: false, reason: 'Node not found' };
  const parent = getParentOf(nodeId);
  if (!parent) return { ok: false, reason: 'No parent' };

  const removedChunkIds = getSubtreeChunkIds(nodeId);
  const idx = parent.children.indexOf(node);
  if (idx >= 0) parent.children.splice(idx, 1);

  bumpVersion();
  return { ok: true, removedChunkIds };
}

export function insertTransition(parentId, beforeSiblingId, { text, chunkIds } = {}) {
  if (!tree) return { ok: false, reason: 'No tree' };
  const parent = getNodeById(parentId);
  if (!parent) return { ok: false, reason: 'Parent not found' };
  if (parent.type === 'fact') return { ok: false, reason: 'Cannot add child to fact' };

  const id = `tr-${Math.random().toString(36).slice(2, 10)}`;
  const newNode = {
    id,
    parentId,
    type: 'transition',
    text: text || 'New transition',
    chunkIds: Array.isArray(chunkIds) ? [...chunkIds] : [],
    children: [],
  };
  let insertIdx = parent.children.length;
  if (beforeSiblingId) {
    const idx = parent.children.findIndex((c) => c.id === beforeSiblingId);
    if (idx >= 0) insertIdx = idx;
  }
  parent.children.splice(insertIdx, 0, newNode);

  bumpVersion();
  return { ok: true, node: newNode };
}

function chunkBlockToMarkdown(meta) {
  if (!meta) return '';
  const t = (meta.text || '').trim();
  if (!t) return '';
  const type = meta.type || 'paragraph';
  if (type.startsWith('heading-')) {
    const depth = Math.max(1, Math.min(6, parseInt(type.split('-')[1] || '1', 10) || 1));
    return '#'.repeat(depth) + ' ' + t;
  }
  if (type === 'list-item') return '- ' + t;
  if (type === 'code') return '```\n' + t + '\n```';
  return t;
}

function isBlockLevel(meta) {
  if (!meta) return false;
  const type = meta.type || '';
  return type.startsWith('heading-') || type === 'list-item' || type === 'code';
}

export async function compileToMarkdown() {
  if (!tree) return '';
  const blocks = [];
  function visit(node) {
    if (!node) return;
    if (Array.isArray(node.chunkIds) && node.chunkIds.length > 0) {
      const metas = [];
      for (const dId of node.chunkIds) {
        const m = getChunkByDisplayId(dId);
        if (m) metas.push(m);
      }
      if (metas.length > 0) {
        const hasBlock = metas.some(isBlockLevel);
        const isStructural = node.type === 'structural';
        const sep = (hasBlock || isStructural) ? '\n\n' : ' ';
        const parts = metas.map(chunkBlockToMarkdown).filter(Boolean);
        if (parts.length > 0) blocks.push(parts.join(sep));
      }
    }
    for (const child of node.children || []) visit(child);
  }
  visit(tree);
  return blocks.join('\n\n');
}

function remapChunkIds(oldChunkMap, newChunkMap) {
  if (!tree) return;
  const oldDisplayToUuid = new Map();
  if (oldChunkMap) {
    for (const [uuid, meta] of oldChunkMap.entries()) {
      if (meta && meta.displayId) oldDisplayToUuid.set(meta.displayId, uuid);
    }
  }
  const newUuidToDisplay = new Map();
  if (newChunkMap) {
    for (const [uuid, meta] of newChunkMap.entries()) {
      if (meta && meta.displayId) newUuidToDisplay.set(uuid, meta.displayId);
    }
  }
  function walk(node) {
    if (Array.isArray(node.chunkIds)) {
      node.chunkIds = node.chunkIds
        .map((dId) => {
          const uuid = oldDisplayToUuid.get(dId);
          if (!uuid) return null;
          return newUuidToDisplay.get(uuid) || null;
        })
        .filter(Boolean);
    }
    for (const c of node.children || []) walk(c);
  }
  walk(tree);
  bumpVersion();
}

export async function applyTreeChangesToDocument() {
  if (!tree) return;
  const oldChunkMap = getChunkMap();
  if (!oldChunkMap) return;
  const oldSnapshot = new Map(oldChunkMap);
  const newSource = await compileToMarkdown();
  await setMarkdownSource(newSource);
  const newChunkMap = getChunkMap();
  remapChunkIds(oldSnapshot, newChunkMap);
}
