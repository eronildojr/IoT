import { Component, ReactNode } from 'react'

interface State { hasError: boolean }

export class MapErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(err: Error) {
    console.error('[MapErrorBoundary]', err)
  }

  reset = () => {
    this.setState({ hasError: false })
    try { localStorage.removeItem('iot_basemap_pref') } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white/70 gap-3 p-6">
          <p className="text-lg">⚠️ Erro ao renderizar o mapa</p>
          <p className="text-xs text-white/40 text-center max-w-md">
            Algo deu errado ao carregar a camada do mapa. Tente resetar a preferência de basemap.
          </p>
          <button
            onClick={this.reset}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-white text-sm"
          >
            Resetar mapa
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
