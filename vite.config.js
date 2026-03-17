import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'

function loadApiKey() {
  try {
    return readFileSync('./secrets/.anthropic.key', 'utf-8').trim()
  } catch {
    return ''
  }
}

function stripHtmlTags(html) {
  // Remove script/style blocks entirely
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  // Replace block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br)\s*>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '')
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n')
  return text.trim()
}

function loadDaubertCorpus() {
  const corpusDir = './corpus/daubert'
  const docs = []
  try {
    const files = readdirSync(corpusDir)
    for (const file of files) {
      if (file === 'INDEX.md') continue
      const filePath = join(corpusDir, file)
      try {
        if (file.endsWith('.html')) {
          const html = readFileSync(filePath, 'utf-8')
          const text = stripHtmlTags(html)
          if (text.length > 100) {
            docs.push({ file, text })
          }
        } else if (file.endsWith('.txt') || file.endsWith('.md')) {
          const text = readFileSync(filePath, 'utf-8').trim()
          if (text.length > 100) {
            docs.push({ file, text })
          }
        }
      } catch (e) {
        console.warn(`[daubert-corpus] Failed to read ${file}:`, e.message)
      }
    }
  } catch {
    // corpus directory doesn't exist yet
  }
  return docs
}

function formatCorpusForPrompt(docs) {
  if (docs.length === 0) return ''
  const sections = docs.map(d =>
    `### ${d.file}\n\n${d.text}`
  )
  return sections.join('\n\n---\n\n')
}

const daubertDocs = loadDaubertCorpus()
console.log(`[daubert-corpus] Loaded ${daubertDocs.length} documents (${daubertDocs.reduce((s, d) => s + d.text.length, 0)} chars)`)

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __ANTHROPIC_API_KEY__: JSON.stringify(loadApiKey()),
    __DAUBERT_CORPUS__: JSON.stringify(formatCorpusForPrompt(daubertDocs)),
  },
  server: {
    host: '0.0.0.0',
    port: 6173,
    allowedHosts: ['crilappsdev1'],
  },
  preview: {
    host: '0.0.0.0',
  },
})
