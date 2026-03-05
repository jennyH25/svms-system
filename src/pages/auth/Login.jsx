import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../../assets/css_logo.png'
import GradientText from '../../components/ui/GradientText'
import AnimatedContent from '../../components/ui/AnimatedContent'
import GlassInput from '../../components/ui/GlassInput'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  // Dummy accounts
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = 'admin123';
  const STUDENT_USERNAME = 'student';
  const STUDENT_PASSWORD = 'student123';

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      navigate('/admin');
    } else if (username === STUDENT_USERNAME && password === STUDENT_PASSWORD) {
      navigate('/student/dashboard');
    } else {
      setError('Invalid username or password');
    }
  } 

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-[1100px] h-[650px] bg-[#0d0d0d] rounded-3xl overflow-hidden flex shadow-2xl border border-white/[0.30]">
        {/* Left Panel */}
        <div className="w-[45%] bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] p-12 flex flex-col justify-between relative">
          {/* Logo */}
          <AnimatedContent distance={30} direction="vertical" duration={0.6} delay={0}>
            <div>
              <img src={logo} alt="Logo" className="h-14 w-auto" />
            </div>
          </AnimatedContent>
          {/* Welcome Text */}
          <div className="flex-1 flex flex-col justify-center -mt-16">
            <AnimatedContent distance={30} direction="vertical" duration={0.6} delay={0.1}>
              <p className="text-gray-400 font-semibold mb-1">Welcome to</p>
            </AnimatedContent>
            <AnimatedContent distance={30} direction="vertical" duration={0.6} delay={0.2}>
              <GradientText
                colors={["#ffffff", "#c9ccd1", "#828587", "#ffffff"]}
                animationSpeed={5}
                showBorder={false}
                className="text-login-title !mx-0"
              >
                Student Violation<br />System
              </GradientText>
            </AnimatedContent>
          </div>
          {/* Description */}
          <AnimatedContent distance={30} direction="vertical" duration={0.6} delay={0.3}>
            <div className="text-gray-500 text-xs leading-relaxed">
              Track, manage, and resolve student<br />
              violations efficiently. Maintain accurate<br />
              records and promote a safe learning<br />
              environment.
            </div>
          </AnimatedContent>
        </div>
        {/* Right Panel */}
        <div className="w-[55%] bg-[#0F1113]/30 p-12 relative">
          {/* Login Form */}
          <div className="mt-10">
            <AnimatedContent distance={30} direction="horizontal" reverse duration={0.6} delay={0.2}>
              <h2 className="text-white text-4xl font-bold mb-12">Login</h2>
            </AnimatedContent>
            {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}
            <AnimatedContent distance={30} direction="horizontal" reverse duration={0.6} delay={0.3}>
              <form onSubmit={handleLogin} className="space-y-8">
                <GlassInput
                  label="USERNAME"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <div>
                  <GlassInput
                    label="PASSWORD"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    endIcon={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c-4.478 0-8.268 2.943-9.543 7a10.025 10.025 0 014.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    }
                  />
                  <div className="text-right mt-2">
                    <a href="#" className="text-gray-400 text-xs hover:text-white transition-colors underline">
                      Forgot Password?
                    </a>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] font-bold py-4 rounded-lg tracking-widest mt-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
                >
                  LOGIN
                </button>
              </form>
            </AnimatedContent>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
