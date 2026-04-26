"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * React Error Boundary — RusSilica BI Terminal
 *
 * Catches unhandled React errors and shows a user-friendly fallback UI
 * instead of a blank white screen. Users can retry or reload.
 *
 * NOTE: Error boundaries must be class components — React doesn't support
 * componentDidCatch in function components.
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development, silent in production
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary] Unhandled React error:", error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4 animate-fade-in">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Произошла непредвиденная ошибка. Попробуйте обновить страницу.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleRetry}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Попробовать снова
              </Button>
              <Button
                size="sm"
                onClick={this.handleReload}
                className="gap-2"
              >
                Обновить страницу
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
