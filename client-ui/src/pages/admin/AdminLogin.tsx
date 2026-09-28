import { Navigate, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../lib/admin'
import AuthLayout from '../auth/AuthLayout'
import SignInForm from '../auth/SignInForm'

/**
 * Administrator sign-in.
 *
 * Visibly a different surface from the customer's — dark panel, different
 * wording — because the two do very different things and mistaking one for the
 * other is the sort of confusion that ends in someone typing an admin password
 * into the wrong form.
 */
export default function AdminLogin() {
  const { status, signIn } = useAdmin()
  const navigate = useNavigate()

  if (status === 'signed-in') return <Navigate to="/admin" replace />

  return (
    <AuthLayout
      tone="ink"
      title="Administrator sign-in"
      subtitle="For provisioning customer accounts."
      blurb={{
        heading: 'Set up a customer in a minute.',
        lines: [
          'Create the workspace, connect it to Perfox, and hand over the details.',
          'Credentials are stored encrypted and never shown again.',
        ],
      }}
      footer={
        <p className="text-ink-3">
          Looking for the console?{' '}
          <a href="/login" className="font-medium text-brand hover:underline">
            Sign in there
          </a>
        </p>
      }
    >
      <SignInForm
        onSubmit={async (email, password) => {
          await signIn(email, password)
          navigate('/admin', { replace: true })
        }}
      />
    </AuthLayout>
  )
}
