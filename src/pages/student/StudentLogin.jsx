import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/css_logo.png';
import GradientText from '../../components/ui/GradientText';
import AnimatedContent from '../../components/ui/AnimatedContent';
import GlassInput from '../../components/ui/GlassInput';

const StudentLogin = () => {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // Dummy student account
  const DUMMY_STUDENT_ID = 'stu-2026';
  const DUMMY_PASSWORD = 'student123';

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    if (studentId === DUMMY_STUDENT_ID && password === DUMMY_PASSWORD) {
      navigate('/student/dashboard');
    } else {
      setError('Invalid student ID or password');
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-[700px] h-[500px] bg-[#0d0d0d] rounded-3xl overflow-hidden flex shadow-2xl border border-white/[0.30]">
        {/* Left Panel */}
        <div className="w-[40%] bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] p-10 flex flex-col justify-center items-center">
          <img src={logo} alt="Logo" className="h-12 w-auto mb-6" />
          <GradientText colors={["#ffffff", "#c9ccd1", "#828587", "#ffffff"]} animationSpeed={5} showBorder={false} className="text-login-title !mx-0">
            Student Portal
          </GradientText>
        </div>
        {/* Right Panel */}
        <div className="w-[60%] bg-[#0F1113]/30 p-10 flex flex-col justify-center">
          <h2 className="text-white text-3xl font-bold mb-8">Student Login</h2>
          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-6">
            <GlassInput
              label="STUDENT ID"
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
            <GlassInput
              label="PASSWORD"
              type={showPassword ? 'text' : 'password'}
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
            <button
              type="submit"
              className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] font-bold py-3 rounded-lg tracking-widest mt-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
            >
              LOGIN
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudentLogin;
