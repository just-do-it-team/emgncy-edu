import React, { ErrorInfo, ReactNode, Suspense } from "react";
import { Spinner } from "@/shared/ui";
import { ErrorPage } from "@/pages/error-page";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.log(error, errorInfo);
  }

  render() {
    const { hasError } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
          <Suspense fallback={<Spinner size={"large"} fullScreen />}>
            <ErrorPage />
          </Suspense>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
