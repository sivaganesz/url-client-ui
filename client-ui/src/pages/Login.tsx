import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/session'
import AuthLayout from './auth/AuthLayout'
import SignInForm from './auth/SignInForm'

/**
 * Customer sign-in.
 *
 * There is no way to create an account from here, and no link offering one.
 * The console reads real customer conversations; accounts are provisioned by
 * an administrator, and a sign-up form would be a door onto that data.
 */
export default function Login() {
  const { status, signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  // Already signed in — resume wherever the guard interrupted.
  if (status === 'signed-in') return <Navigate to={from} replace />

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the details your administrator gave you."
      footer={
        <p>
          No account?{' '}
          <span className="text-ink-2">
            Accounts are created by your administrator — ask them for one.
          </span>
        </p>
      }
    >
      <SignInForm
        onSubmit={async (email, password) => {
          await signIn(email, password)
          navigate(from, { replace: true })
        }}
      />
    </AuthLayout>
  )
}
