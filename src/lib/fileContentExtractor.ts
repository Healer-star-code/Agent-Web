// 浏览器端文档内容提取：把用户上传的文档文件解析成纯文本，拼到 prompt 里发给 AI。
// 后端 /prompt 接口只支持 text + image，不支持文件附件，所以前端必须自己提取文本。
//
// 支持：txt/md/csv/json 等文本、docx、xlsx、pptx
// 不支持：pdf（pdf-parse 是 Node 库）、doc/ppt（旧版二进制格式）

import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

export interface ExtractedContent {
  text: string
  error?: string
}

const TEXT_EXTS = [
  'txt', 'md', 'mdx', 'csv', 'json', 'jsonl', 'xml', 'html', 'htm',
  'yaml', 'yml', 'toml', 'log', 'js', 'ts', 'py', 'java', 'c', 'cpp',
  'go', 'rs', 'rb', 'php', 'sh', 'bat', 'ps1', 'sql', 'ini', 'conf',
  'env', 'css', 'scss', 'less', 'vue', 'jsx', 'tsx',
]

const MAX_CONTENT_LEN = 80000

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LEN) return text
  return text.slice(0, MAX_CONTENT_LEN) + '\n\n...(内容过长已截断)'
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export async function extractFileContent(file: File): Promise<ExtractedContent> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  try {
    if (TEXT_EXTS.includes(ext)) {
      const text = await file.text()
      return { text: truncate(text) }
    }

    if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      return { text: truncate(result.value) }
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheets: string[] = []
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet)
        sheets.push(`--- 工作表: ${sheetName} ---\n${csv}`)
      }
      return { text: truncate(sheets.join('\n\n')) }
    }

    if (ext === 'pptx') {
      const arrayBuffer = await file.arrayBuffer()
      const zip = await JSZip.loadAsync(arrayBuffer)
      const slidePaths = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const na = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0')
          const nb = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0')
          return na - nb
        })
      const slides: string[] = []
      for (const slidePath of slidePaths) {
        const xml = await zip.files[slidePath].async('text')
        const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? []
        const texts = matches.map((m) => unescapeXml(m.replace(/<\/?a:t>/g, '')))
        const slideNum = slidePath.match(/slide(\d+)/)?.[1] ?? '?'
        slides.push(`--- 第 ${slideNum} 页 ---\n${texts.join('\n')}`)
      }
      return { text: truncate(slides.join('\n\n')) }
    }

    if (ext === 'pdf') {
      return { text: '', error: 'PDF 文件暂不支持在浏览器中解析，请转为 Word 或文本格式' }
    }
    if (ext === 'doc') {
      return { text: '', error: '旧版 .doc 格式暂不支持，请另存为 .docx 格式' }
    }
    if (ext === 'ppt') {
      return { text: '', error: '旧版 .ppt 格式暂不支持，请另存为 .pptx 格式' }
    }

    return { text: '', error: `不支持的文件格式：.${ext}` }
  } catch (err) {
    return { text: '', error: `文件解析失败：${err instanceof Error ? err.message : String(err)}` }
  }
}
