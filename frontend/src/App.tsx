import { useEffect, useRef, useState } from 'react'
import './App.css'
import { ErrorBoundary } from './ErrorBoundary'

type PipeResponse = {
  english: string
  spanish: string
  audio?: { mime: string; base64: string }
} | { error: string }

function AppContent() {
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [spanish, setSpanish] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoSend, setAutoSend] = useState(true)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const lastBlobRef = useRef<Blob | null>(null)
  const [ttsUrl, setTtsUrl] = useState<string | null>(null)
  const [ttsMime, setTtsMime] = useState<string | null>(null)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const [recordedSize, setRecordedSize] = useState<number | null>(null)
  const preferredMimeRef = useRef<string | null>(null)
  const [chosenMime, setChosenMime] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const chatRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      // cleanup recorder if component unmounts
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    setError(null)
    setTranscript('')
    setSpanish('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // negotiate a working mimeType for MediaRecorder across browsers
      const candidates = [
        preferredMimeRef.current,
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/wav'
      ].filter(Boolean) as string[]

      let mr: MediaRecorder | null = null
      let selected: string | null = null
      for (const m of candidates) {
        try {
          mr = new MediaRecorder(stream, { mimeType: m })
          selected = m
          break
        } catch {
          // ignore unsupported mime types silently
        }
      }
      if (!mr) {
        try {
          // try without options
          mr = new MediaRecorder(stream)
          const maybe = mr as unknown as { mimeType?: string }
          selected = maybe.mimeType || null
        } catch (e) {
          const msg = String(e)
          setError('Failed to start recording: ' + msg)
          return
        }
      }
      preferredMimeRef.current = selected
      setChosenMime(selected)

      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
        // silently ignore empty chunks
      }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        setRecordedSize(blob.size)

        // store for preview/download
        try {
          if (recordedUrl) URL.revokeObjectURL(recordedUrl)
        } catch {
          // ignore revoke errors silently
        }
        const url = URL.createObjectURL(blob)
        lastBlobRef.current = blob
        setRecordedUrl(url)
        
        // optionally auto-send to server
        if (autoSend) await sendForTranscription(blob)

        // stop tracks
        stream.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current = mr
  // start with timeslice to force chunk generation every 100ms
  mr.start(100)
      setRecording(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mic permission denied or unsupported'
      setError(msg)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setRecording(false)
      mediaRecorderRef.current.stop()
    }
  }

  const sendForTranscription = async (blob: Blob) => {
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      // name the file with extension matching type if possible
      const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('wav') ? 'wav' : 'webm'
      form.append('audio', blob, `recording.${ext}`)

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: form,
      })

      const data: PipeResponse = await res.json()
      if (!res.ok) throw new Error(('error' in data && data.error) || 'Request failed')

      if ('english' in data) setTranscript(data.english)
      if ('spanish' in data) setSpanish(data.spanish)

      // decode and play TTS audio if provided
      if ('audio' in data && data.audio?.base64) {
        try {
          const { base64, mime } = data.audio as { base64: string; mime: string }
          const binary = atob(base64)
          const len = binary.length
          const bytes = new Uint8Array(len)
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
          const ttsBlob = new Blob([bytes], { type: mime })
          const url = URL.createObjectURL(ttsBlob)
          if (ttsUrl) URL.revokeObjectURL(ttsUrl)
          setTtsUrl(url)
          setTtsMime(mime)
          // attempt autoplay (may be blocked by browser)
          setTimeout(() => ttsAudioRef.current?.play().catch(() => {}), 50)
        } catch {
          // decoding failed: ignore silently
        }
      } else {
        if (ttsUrl) {
          URL.revokeObjectURL(ttsUrl)
          setTtsUrl(null)
          setTtsMime(null)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to transcribe/translate'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // auto-scroll chat to bottom when transcript or spanish updates
  useEffect(() => {
    try {
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      } else if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight
      }
    } catch {
      // ignore scrolling errors
    }
  }, [transcript, spanish])

  return (
    <div className="app">
      <div className="card">
        {loading && (
          <div className="card-overlay" role="status" aria-live="polite">
            <div className="loader" aria-hidden="true" />
            <div className="overlay-label">Processing audio…</div>
          </div>
        )}
        <header className="card-header">
          <div>
            <h1>Voice → Text • Spanish</h1>
            <p className="muted">Record in English. We'll transcribe and translate to Spanish automatically.</p>
          </div>
          <div className="status">
            {recording ? <span className="dot recording">Recording</span> : <span className="dot idle">Idle</span>}
            {chosenMime && <div className="mime">mime: {chosenMime}</div>}
          </div>
        </header>

        <main className="card-body">
          <section className="left">
            <div className="controls">
              <button
                className={`big-fab ${recording ? 'stop' : 'start'}`}
                onClick={recording ? stopRecording : startRecording}
                disabled={loading}
                title={recording ? 'Stop' : 'Start'}
              >
                {recording ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor"/><path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V19a1 1 0 1 0 2 0v-3.1A5 5 0 0 0 19 11z" fill="currentColor"/></svg>
                )}
              </button>

              <div className="small-actions">
                <label className="checkbox">
                  <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
                  <span>Auto-send</span>
                </label>
                <button
                  className="btn ghost"
                  onClick={async () => {
                    preferredMimeRef.current = 'audio/webm;codecs=opus'
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
                    await startRecording()
                  }}
                >
                  Retry webm
                </button>
              </div>
            </div>

            <div className="preview">
              {recordedUrl ? (
                <>
                  <label className="label">Preview</label>
                  <audio src={recordedUrl} controls className="audio-player" />
                  <div className="preview-actions">
                    <button className="btn primary" onClick={async () => lastBlobRef.current && await sendForTranscription(lastBlobRef.current)} disabled={loading}>
                      {loading ? <span className="btn-spinner" aria-hidden /> : 'Send'}
                    </button>
                    <a className="btn ghost" href={recordedUrl} download={`recording.${lastBlobRef.current?.type.includes('webm') ? 'webm' : lastBlobRef.current?.type.includes('wav') ? 'wav' : 'webm'}`}>Download</a>
                  </div>
                </>
              ) : (
                <div className="placeholder">No recording yet. Click the button to start.</div>
              )}
            </div>

            {ttsUrl && (
              <div className="tts">
                <label className="label">TTS</label>
                <audio ref={ttsAudioRef} src={ttsUrl} controls className="audio-player" />
                <a className="btn ghost" href={ttsUrl} download={`tts.${ttsMime?.split('/')[1] || 'wav'}`}>Download TTS</a>
              </div>
            )}

            {error && <div className="error">{error}</div>}
          </section>

          <aside className="right">
            <div className="chat">
              <div className="bubble user">
                <div className="bubble-meta">You · English</div>
                <div className="bubble-body">{transcript || <span className="muted">Transcription will appear here</span>}</div>
              </div>

              <div className="bubble bot">
                <div className="bubble-meta">Assistant · Spanish</div>
                <div className="bubble-body">{spanish || <span className="muted">Translation will appear here</span>}</div>
                {ttsUrl && <button className="btn tiny" onClick={() => ttsAudioRef.current?.play()}>Play TTS</button>}
              </div>
            </div>

            <div className="meta">
              {recordedSize !== null && <div className="muted">Size: {Math.round(recordedSize / 1024)} KB</div>}
              <div className="muted small">Uses MediaRecorder; audio sent to /api/transcribe on stop.</div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
