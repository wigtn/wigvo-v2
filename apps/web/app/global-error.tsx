'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            Something went wrong
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            {error.message || 'An unexpected error occurred.'}
          </p>
          {error.digest && (
            <p className="mb-4 font-mono text-xs text-gray-400">
              Digest: {error.digest}
            </p>
          )}
          <div className="flex justify-center gap-3">
            <button
              onClick={reset}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
