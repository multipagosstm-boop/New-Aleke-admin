import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 m-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive space-y-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-destructive shrink-0" />
            <div>
              <h3 className="font-semibold text-base">Ocurrió un error al cargar este módulo</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {this.state.error?.message || 'Error inesperado'}
              </p>
            </div>
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
