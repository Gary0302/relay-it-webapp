'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { cn } from '@/lib/utils'
import Image from 'next/image'

// Animated text component with fade/slide effect
function AnimatedText({ text, className }: { text: string; className?: string }) {
    const [displayText, setDisplayText] = useState(text)
    const [isAnimating, setIsAnimating] = useState(false)

    useEffect(() => {
        if (text !== displayText) {
            setIsAnimating(true)
            const timer = setTimeout(() => {
                setDisplayText(text)
                setIsAnimating(false)
            }, 150)
            return () => clearTimeout(timer)
        }
    }, [text, displayText])

    return (
        <span
            className={cn(
                "inline-block transition-all duration-300 ease-out",
                isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0",
                className
            )}
        >
            {displayText}
        </span>
    )
}

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<String | null>(null)
    const [loading, setLoading] = useState(false)
    const [isSignUp, setIsSignUp] = useState(false)
    const { signIn, signUp } = useAuth()
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const { error } = isSignUp
                ? await signUp(email, password)
                : await signIn(email, password)
            if (error) {
                setError(error.message)
            } else {
                if (isSignUp) {
                    setError(null)
                    setIsSignUp(false)
                    alert('Account created! Please check your email to confirm, then sign in.')
                } else {
                    router.push('/')
                }
            }
        } catch (err) {
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#E8EDE7] p-4">
            <div className="w-full max-w-[400px] bg-[#F2F5F1] rounded-2xl shadow-sm p-8 md:p-10">
                <div className="flex flex-col items-center mb-8">
                    <div className="mb-4">
                        <img src="/icon.png" alt="Relay it! Logo" className="w-16 h-16 object-contain" />
                    </div>
                    <h1 className="text-3xl font-bold text-[#1E293B] tracking-tight mb-2">
                        Relay it!
                    </h1>
                    <p className="text-[#64748B] text-sm font-medium h-5">
                        <AnimatedText text={isSignUp ? 'Create your account' : 'Welcome back'} />
                    </p>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                    <div className="space-y-1.5">
                        <label htmlFor="email" className="block text-xs font-bold text-[#475569] ml-1">
                            Email
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="block w-full rounded-lg border-0 bg-[#F7F9F6] px-4 py-3 text-[#1E293B] shadow-sm ring-1 ring-inset ring-[#D6DBD5] placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#8F9F88] sm:text-sm sm:leading-6 transition-all"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="password" className="block text-xs font-bold text-[#475569] ml-1">
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="block w-full rounded-lg border-0 bg-[#F7F9F6] px-4 py-3 text-[#1E293B] shadow-sm ring-1 ring-inset ring-[#D6DBD5] placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#8F9F88] sm:text-sm sm:leading-6 transition-all"
                            placeholder="Enter your password"
                        />
                    </div>

                    {error && (
                        <div className="text-red-600 text-xs text-center bg-red-50 p-2 rounded-lg font-medium">
                            {error}
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className={cn(
                                "flex w-full justify-center rounded-lg bg-[#8F9F88] px-3 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#7A8C73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8F9F88] transition-colors duration-200",
                                loading && "opacity-70 cursor-wait"
                            )}
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <AnimatedText text={isSignUp ? 'Creating Account...' : 'Signing In...'} />
                                </span>
                            ) : (
                                <AnimatedText text={isSignUp ? 'Create Account' : 'Sign In'} />
                            )}
                        </button>
                    </div>

                    <div className="text-center mt-6">
                        <p className="text-xs font-medium text-[#64748B]">
                            <AnimatedText text={isSignUp ? 'Already have an account? ' : "Don't have an account? "} />
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSignUp(!isSignUp)
                                    setError(null)
                                }}
                                className="text-[#8F9F88] hover:underline"
                            >
                                <AnimatedText text={isSignUp ? 'Sign In' : 'Create Account'} />
                            </button>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    )
}
