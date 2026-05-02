import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  Zap, Shield, TrendingUp, Clock, HeadphonesIcon, Code2,
  Star, ChevronRight, ArrowRight, Users, Package, Award,
} from 'lucide-react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { usePublicServices } from '@/hooks/useServices'
import { formatCurrency, getPlatformIcon } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })

  useEffect(() => {
    if (!isInView) return
    let start = 0
    const step = target / 60
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [isInView, target])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

const features = [
  { icon: Zap, title: 'Lightning Fast Delivery', desc: 'Orders start within minutes of being placed. We never keep you waiting.', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { icon: Shield, title: '100% Secure & Safe', desc: 'Bank-level encryption protects every transaction. Your account stays safe.', color: 'text-green-400', bg: 'bg-green-500/10' },
  { icon: TrendingUp, title: 'Real Engagement', desc: 'Authentic-looking engagement from real-looking accounts. No bots or fake profiles.', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { icon: Clock, title: '24/7 Support', desc: 'Our team is available around the clock to help with any issue you face.', color: 'text-brand-400', bg: 'bg-brand-500/10' },
  { icon: HeadphonesIcon, title: 'Refill Guarantee', desc: 'If your numbers drop, we refill them for free. No questions asked.', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { icon: Code2, title: 'Reseller API', desc: 'Build on top of Follomax with our powerful API. Perfect for agencies.', color: 'text-brand-400', bg: 'bg-brand-500/10' },
]

const testimonials = [
  { name: 'Sarah M.', role: 'Influencer', text: 'Follomax is the most reliable SMM panel I\'ve ever used. Orders complete fast and the dashboard is beautiful.', rating: 5 },
  { name: 'James K.', role: 'Digital Agency', text: 'The reseller API is top-notch. We\'ve integrated it into our own platform within hours.', rating: 5 },
  { name: 'Amara O.', role: 'Content Creator', text: 'I\'ve tried many panels and Follomax stands out with its quality and customer support.', rating: 5 },
]

export function LandingPage() {
  const navigate = useNavigate()
  const { data: services } = usePublicServices()

  return (
    <PublicLayout>
      {/* HERO */}
      <section className="relative overflow-hidden py-20 md:py-32">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/6 rounded-full blur-3xl" />
          <div className="absolute top-1/4 right-0 w-[400px] h-[400px] bg-brand-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-600/5 rounded-full blur-3xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'linear-gradient(rgba(8,145,216,1) 1px,transparent 1px),linear-gradient(90deg,rgba(8,145,216,1) 1px,transparent 1px)', backgroundSize: '50px 50px' }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-sm font-medium mb-8">
              <Zap className="w-4 h-4" />
              The #1 SMM Panel for Growth
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight mb-6">
              Grow Your{' '}
              <span className="gradient-text">Social Media</span>
              <br />
              Fast & Affordable
            </h1>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Buy followers, likes, views, comments and more for all major social platforms.
              Real results. Instant delivery. Guaranteed quality.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" onClick={() => navigate('/register')} rightIcon={<ArrowRight className="w-5 h-5" />} className="text-base px-8">
                Start Growing Today
              </Button>
              <Button size="lg" variant="secondary" onClick={() => navigate('/login')} className="text-base px-8">
                Sign In
              </Button>
            </div>

            <p className="text-sm text-gray-600 mt-6">No credit card required to sign up · Start with any amount</p>
          </motion.div>

          {/* Hero mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-16 max-w-4xl mx-auto"
          >
            <div className="glass-card rounded-2xl p-1 shadow-brand-lg">
              <div className="bg-navy-800 rounded-xl overflow-hidden">
                {/* Fake browser bar */}
                <div className="flex items-center gap-2 px-4 py-3 bg-navy-700/50 border-b border-navy-500/30">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  </div>
                  <div className="flex-1 bg-navy-600/50 rounded-lg px-3 py-1 text-xs text-gray-500 text-center">
                    follomax.com/dashboard
                  </div>
                </div>
                {/* Fake dashboard */}
                <div className="p-6">
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                      { label: 'Total Orders', value: '1,284', color: 'text-brand-300' },
                      { label: 'Active', value: '12', color: 'text-blue-300' },
                      { label: 'Balance', value: '$48.20', color: 'text-green-300' },
                      { label: 'Total Spent', value: '$312.50', color: 'text-orange-300' },
                    ].map(card => (
                      <div key={card.label} className="bg-navy-700/60 rounded-xl p-3">
                        <p className="text-xs text-gray-500">{card.label}</p>
                        <p className={`text-lg font-bold mt-1 ${card.color}`}>{card.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {[
                      { platform: '📸', name: 'Instagram Followers', qty: '1,000', status: 'completed', price: '$1.20' },
                      { platform: '▶️', name: 'YouTube Views', qty: '5,000', status: 'in_progress', price: '$3.50' },
                      { platform: '🎵', name: 'TikTok Likes', qty: '500', status: 'pending', price: '$0.80' },
                    ].map(row => (
                      <div key={row.name} className="flex items-center gap-3 bg-navy-700/30 rounded-lg px-3 py-2">
                        <span className="text-base">{row.platform}</span>
                        <span className="flex-1 text-sm text-gray-300 truncate">{row.name}</span>
                        <span className="text-xs text-gray-500">{row.qty}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          row.status === 'completed' ? 'bg-green-500/15 text-green-400' :
                          row.status === 'in_progress' ? 'bg-blue-500/15 text-blue-400' :
                          'bg-yellow-500/15 text-yellow-400'
                        }`}>{row.status}</span>
                        <span className="text-sm font-bold text-white">{row.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="py-16 border-y border-navy-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { icon: Package, value: 10, suffix: 'M+', label: 'Orders Delivered', color: 'text-brand-400' },
              { icon: Users, value: 50, suffix: 'K+', label: 'Happy Customers', color: 'text-blue-400' },
              { icon: Zap, value: 500, suffix: '+', label: 'Services Available', color: 'text-yellow-400' },
              { icon: Award, value: 99, suffix: '.9%', label: 'Uptime Guarantee', color: 'text-green-400' },
            ].map(({ icon: Icon, value, suffix, label, color }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="space-y-2"
              >
                <Icon className={`w-6 h-6 ${color} mx-auto`} />
                <p className={`text-4xl font-bold ${color}`}>
                  <AnimatedCounter target={value} suffix={suffix} />
                </p>
                <p className="text-sm text-gray-400">{label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="text-4xl font-bold text-white mb-4">Why Choose <span className="gradient-text">Follomax</span>?</h2>
              <p className="text-gray-400 text-lg max-w-xl mx-auto">Everything you need to grow your social media presence, in one place.</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="glass-card-hover rounded-2xl p-6"
              >
                <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                  <f.icon className={`w-6 h-6 ${f.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING PREVIEW */}
      <section id="pricing" className="py-20 bg-navy-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="text-4xl font-bold text-white mb-4">Affordable <span className="gradient-text">Pricing</span></h2>
              <p className="text-gray-400 text-lg">Starting from as low as $0.001 per unit. See our most popular services.</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {(services || []).slice(0, 6).map((svc, i) => (
              <motion.div
                key={svc.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="glass-card-hover rounded-xl p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{svc.categories?.icon || getPlatformIcon(svc.name)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{svc.name}</p>
                    <p className="text-xs text-gray-500">{svc.categories?.name}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Starting from</p>
                    <p className="text-lg font-bold text-brand-300">{formatCurrency(svc.rate)}<span className="text-xs text-gray-500">/1K</span></p>
                  </div>
                  <button
                    onClick={() => navigate('/register')}
                    className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
                  >
                    Order <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center">
            <Button size="lg" onClick={() => navigate('/register')} rightIcon={<ArrowRight className="w-5 h-5" />}>
              View All Services
            </Button>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="text-4xl font-bold text-white mb-4">What Our <span className="gradient-text">Customers Say</span></h2>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card rounded-2xl p-6"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="glass-card rounded-3xl p-12 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-radial from-brand-500/10 to-transparent pointer-events-none" />
              <h2 className="text-4xl font-bold text-white mb-4 relative">
                Ready to <span className="gradient-text">Grow?</span>
              </h2>
              <p className="text-gray-400 text-lg mb-8 relative max-w-xl mx-auto">
                Join thousands of creators, businesses, and agencies who trust Follomax for their social media growth.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center relative">
                <Button size="lg" onClick={() => navigate('/register')} className="px-10 text-base" rightIcon={<ArrowRight className="w-5 h-5" />}>
                  Create Free Account
                </Button>
                <Button size="lg" variant="secondary" onClick={() => navigate('/login')} className="px-10 text-base">
                  Sign In
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-navy-500/30 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <img src="/logo.png" alt="Follomax" className="w-7 h-7 rounded-xl object-cover" />
              <span className="font-bold gradient-text">Follomax</span>
            </Link>
            <p className="text-sm text-gray-500">© 2025 Follomax. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Terms</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Privacy</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </PublicLayout>
  )
}
