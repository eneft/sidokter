import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  declare state: State;
  declare setState: (updater: Partial<State> | ((state: State) => Partial<State>)) => void;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SIDOKTER ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetSession = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('soegiri_sop_client_session_v3');
      localStorage.removeItem('sidokter_remember_username_pref');
    } catch {}
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 text-center space-y-5">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <AlertTriangle className="w-7 h-7" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800">
                Terjadi Kendala pada Tampilan
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sistem mengalami kendala sementara saat memuat komponen antarmuka. Anda dapat memuat ulang halaman atau mereset sesi untuk melanjutkan.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left overflow-auto max-h-32">
                <p className="text-xs font-mono text-red-600 font-semibold break-words">
                  {this.state.error.message || String(this.state.error)}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Muat Ulang
              </button>
              <button
                type="button"
                onClick={this.handleResetSession}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Reset Sesi
              </button>
            </div>
            
            <div className="text-[11px] text-slate-400">
              RSUD Dr. Soegiri Lamongan · SIDOKTER
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
