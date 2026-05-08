import { useEffect } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`toast toast-${type}`} onClick={onClose}>
      {message}
    </div>
  )
}

// Global toast state
let toastFn: ((msg: string, type?: ToastType) => void) | null = null

export function setToastFn(fn: (msg: string, type?: ToastType) => void) {
  toastFn = fn
}

export function toast(msg: string, type: ToastType = 'success') {
  toastFn?.(msg, type)
}
