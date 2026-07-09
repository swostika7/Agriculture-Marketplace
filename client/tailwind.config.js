module.exports = {
  content: ['./src/**/*.{js,jsx}','./public/index.html'],
  theme: {
    extend: {
      colors: {
        earth: { 50:'#f7f5f0',100:'#ede8dc',200:'#d9cfb9',300:'#c0af8e',400:'#a68f69',500:'#8b7050',600:'#6f5540',700:'#543f30',800:'#3a2a1f',900:'#221810' },
        leaf:  { 50:'#f0f9f0',100:'#d5f0d5',200:'#a5dea5',300:'#6ec86e',400:'#44b044',500:'#2a8f2a',600:'#1e6e1e',700:'#145214',800:'#0c380c',900:'#061f06' },
        harvest:{ 50:'#fffbea',100:'#fff2c2',200:'#ffe280',300:'#ffd040',400:'#ffc000',500:'#f5a800',600:'#d98a00',700:'#b56d00',800:'#925200',900:'#783e00' },
        sky:   { 50:'#f0f8ff',100:'#ddf0fe',200:'#b3dffe',300:'#7bc8fd',400:'#36aafc',500:'#068ae0' },
        khalti:{ 500:'#5c2d91',600:'#4a1f78',100:'#ede5f5' },
        esewa: { 500:'#60bb46',600:'#4a9a34',100:'#e8f5e2' },
      },
      fontFamily: {
        display:['\'Playfair Display\'','Georgia','serif'],
        body:   ['\'DM Sans\'','system-ui','sans-serif'],
        mono:   ['\'JetBrains Mono\'','monospace'],
      },
      backgroundImage: {
        'field-pattern':"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232a8f2a' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        card:   '0 2px 20px rgba(42,143,42,0.08)',
        glow:   '0 0 28px rgba(42,143,42,0.18)',
        harvest:'0 4px 20px rgba(245,168,0,0.15)',
        payment:'0 8px 32px rgba(0,0,0,0.12)',
      },
      animation: {
        'float':    'float 3s ease-in-out infinite',
        'fade-in':  'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
        'pulse-slow':'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        float:   {'0%,100%':{transform:'translateY(0)'},'50%':{transform:'translateY(-8px)'}},
        fadeIn:  {from:{opacity:'0'},to:{opacity:'1'}},
        slideUp: {from:{opacity:'0',transform:'translateY(16px)'},to:{opacity:'1',transform:'translateY(0)'}},
      },
    },
  },
  plugins: [],
};
