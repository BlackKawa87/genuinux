import { useParams, Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Clock, BookOpen, Tag } from 'lucide-react'

const C = {
  bg: '#F8FAFC', surface: '#FFFFFF', border: '#E2E8F0',
  text: '#0F172A', textSec: '#64748B', textMut: '#94A3B8',
  trust: '#16C784', trustBg: 'rgba(22,199,132,0.08)',
  trustBd: 'rgba(22,199,132,0.2)', dark: '#0F172A',
}

interface Post {
  slug: string
  category: string
  title: string
  date: string
  readTime: string
  excerpt: string
  content: React.ReactNode
}

function Code({ children }: { children: string }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-sm"
      style={{ background: '#F1F5F9', color: '#0F172A', fontFamily: 'IBM Plex Mono, monospace' }}>
      {children}
    </code>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-xl overflow-x-auto p-5 my-6 text-sm leading-relaxed"
      style={{ background: C.dark, color: '#94A3B8', fontFamily: 'IBM Plex Mono, monospace' }}>
      {children}
    </pre>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold mt-10 mb-4" style={{ color: C.text, letterSpacing: '-0.02em' }}>
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-base leading-relaxed mb-5" style={{ color: C.textSec }}>
      {children}
    </p>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5 my-6 flex gap-3"
      style={{ background: C.trustBg, border: `1px solid ${C.trustBd}` }}>
      <BookOpen size={16} style={{ color: C.trust, flexShrink: 0, marginTop: 2 }} />
      <p className="text-sm leading-relaxed" style={{ color: C.textSec }}>{children}</p>
    </div>
  )
}

const POSTS: Post[] = [
  {
    slug: 'detect-account-takeover',
    category: 'Fraud Detection',
    title: 'How to detect account takeover before it happens',
    date: 'May 12, 2026',
    readTime: '5 min read',
    excerpt: 'An overview of behavioral signals that predict ATO attempts — and how to act on them in real time.',
    content: (
      <>
        <P>
          Account takeover (ATO) attacks are among the most damaging fraud vectors a platform can face.
          Unlike chargebacks or promo abuse, a successful ATO gives attackers full control of a legitimate
          user's identity — their payment methods, personal data, and trust score with your platform.
          The average ATO attack causes $12,000 in damages per incident when factoring in support costs,
          fraud losses, and reputational damage.
        </P>
        <P>
          The good news: ATO attacks are highly predictable. Attackers follow recognizable patterns,
          and the signals arrive well before any damage is done. Here's what to watch for.
        </P>

        <H2>1. Credential stuffing patterns</H2>
        <P>
          The most common ATO vector is credential stuffing — automated tools testing stolen
          username/password pairs from data breaches. These attacks have a distinct fingerprint:
          a high volume of <Code>login</Code> events from the same IP or IP range, most of which fail,
          followed by a small number of successes.
        </P>
        <P>
          The key signals: <Code>ip_signup_count_1h</Code> spiking above 10 from a single IP,
          combined with a surge of distinct user IDs being tested. Genuinux tracks both in the context
          window sent to every risk check.
        </P>
        <Callout>
          A single IP testing more than 15 unique email addresses in one hour has a 94% correlation
          with credential stuffing in our dataset. Setting a custom rule on <Code>ip_user_count_1h &gt; 15</Code> to
          block automatically is a high-signal, low-noise intervention.
        </Callout>

        <H2>2. Session anomalies after login</H2>
        <P>
          Even if the attacker passes the login check, post-login behavior differs sharply from
          legitimate users. Watch for: immediate navigation to high-value pages (payment settings,
          withdrawal, personal info), device or user-agent changes mid-session, and access from a
          country the user has never authenticated from.
        </P>
        <P>
          Genuinux's <Code>device_user_count</Code> signal captures how many unique users have
          logged in from the same device fingerprint. A device that's seen 3+ user IDs is a strong
          indicator of an attacker reusing the same browser profile.
        </P>

        <H2>3. The password-change + withdrawal pattern</H2>
        <P>
          This is the clearest signal of an in-progress ATO: an attacker who's gained access will
          immediately change the password (to lock out the real user) and then trigger a high-value
          action — withdrawal, gift card purchase, or address change.
        </P>
        <P>
          Instrument your flows so a <Code>transaction</Code> or <Code>withdrawal</Code> event
          within 5 minutes of a password change is automatically routed to manual review.
          This single rule catches a large portion of completed ATOs before money leaves the platform.
        </P>

        <H2>4. Implementing ATO detection with Genuinux</H2>
        <P>
          Here's an example API call that sends a login event with full context. The risk engine will
          evaluate all active signals and return a decision in under 50ms:
        </P>
        <CodeBlock>{`POST /api/risk/check
Authorization: Bearer gnx_live_xxxxxxxxxxxx

{
  "external_user_id": "user_8821",
  "event_type": "login",
  "email": "user@example.com",
  "ip_address": "203.0.113.42",
  "device_id": "d_abc123",
  "user_agent": "Mozilla/5.0 ...",
  "country": "BR"
}

// Response
{
  "decision": "review",
  "risk_level": "high",
  "fraud_score": 62,
  "signals": [
    { "code": "ip_velocity_high", "label": "High IP velocity" },
    { "code": "device_multi_user", "label": "Device seen with multiple users" }
  ]
}`}</CodeBlock>

        <H2>5. Recommended thresholds</H2>
        <P>
          For login events, we recommend a review threshold of 35 and a block threshold of 65.
          These are more aggressive than the defaults (40/70) because the cost of a missed ATO on
          login is higher than on a low-value action. You can configure these per-risk-level in
          Settings → Risk Preferences.
        </P>
        <P>
          For withdrawal and transaction events from recently-changed accounts, route all traffic
          to review regardless of score for the first 15 minutes after the change.
        </P>
      </>
    ),
  },
  {
    slug: 'cost-of-false-positives',
    category: 'Risk Strategy',
    title: 'The true cost of false positives in fraud prevention',
    date: 'April 28, 2026',
    readTime: '4 min read',
    excerpt: 'Every blocked legitimate user has a cost. We break down how to measure it and optimize your thresholds.',
    content: (
      <>
        <P>
          Most fraud teams optimize for one number: the fraud rate. How many bad transactions got
          through? But this framing ignores the other side of the equation — the legitimate users
          you're blocking in the process. False positives aren't free. They're some of the most
          expensive mistakes a fraud system can make.
        </P>

        <H2>What a false positive actually costs</H2>
        <P>
          When a legitimate user is blocked, the immediate cost is the lost transaction value.
          But that's often the smallest part. The real costs compound:
        </P>
        <P>
          <strong style={{ color: C.text }}>Support load:</strong> Blocked users don't disappear — they
          file disputes, contact support, and churn if the experience is bad enough. A single false
          positive can generate $15–$40 in support costs before the transaction is ever recovered.
        </P>
        <P>
          <strong style={{ color: C.text }}>Trust damage:</strong> 42% of users who are falsely
          blocked report they will not return to the platform, even after the block is resolved.
          For high-LTV customers, a single false block can cost thousands in lifetime value.
        </P>
        <P>
          <strong style={{ color: C.text }}>Review queue backlog:</strong> If you're routing too many
          events to manual review, your analysts are spending time on legitimate transactions instead
          of actual fraud. This reduces your effective detection rate for real threats.
        </P>

        <H2>Measuring your false positive rate</H2>
        <P>
          The standard metric is the <strong style={{ color: C.text }}>False Positive Rate (FPR)</strong>:
          the percentage of legitimate transactions that are blocked or sent to review.
          A well-tuned system should have an FPR below 0.5% for block decisions and below 3% for
          review decisions.
        </P>
        <P>
          In the Genuinux dashboard, open Events and filter by <Code>decision: block</Code>.
          Sample 50 blocked events from the past week and manually classify each as true fraud or
          false positive. Your FPR is <Code>false positives / (false positives + true negatives)</Code>.
        </P>
        <Callout>
          If your FPR for blocks exceeds 1%, raise your block threshold by 5 points.
          If it's below 0.1%, your block threshold may be too conservative — lower it to catch more
          fraud before it reaches review. This calibration cycle should happen monthly.
        </Callout>

        <H2>The threshold optimization problem</H2>
        <P>
          There's an inherent tension in fraud prevention: every threshold you set is a bet.
          A low block threshold catches more fraud but blocks more good users. A high threshold
          lets more fraud through but creates a better experience for legitimate users.
        </P>
        <P>
          The optimal point depends entirely on your business: the average order value,
          the LTV of a blocked customer, your chargeback rate, and your operational review capacity.
          There's no universal answer, but there is a framework: calculate the expected cost per
          decision at each threshold and find the point where marginal fraud caught equals
          marginal false positive cost.
        </P>

        <H2>Adjusting thresholds in Genuinux</H2>
        <P>
          Open Settings → Risk Preferences to adjust the review and block thresholds for your
          organization. Changes take effect on the next deployment. We recommend making changes
          in increments of 5 points and observing the impact over 48–72 hours before adjusting further.
        </P>
        <P>
          For more surgical control, use custom rules (Settings → Rules) to apply different thresholds
          to specific event types — for example, a lower block threshold for <Code>withdrawal</Code>
          events than for <Code>login</Code> events.
        </P>
      </>
    ),
  },
  {
    slug: 'first-custom-fraud-rule',
    category: 'Developer Guide',
    title: 'Building your first custom fraud rule with Genuinux',
    date: 'April 15, 2026',
    readTime: '6 min read',
    excerpt: 'A step-by-step guide to writing, testing, and deploying custom rules without touching your production code.',
    content: (
      <>
        <P>
          Genuinux's built-in risk engine covers the most common fraud patterns out of the box.
          But every platform has unique edge cases — geographic restrictions, product-specific velocity
          limits, or business rules that don't map neatly onto a generic fraud score.
          Custom rules let you encode those constraints without writing code.
        </P>

        <H2>When to use custom rules vs. score tuning</H2>
        <P>
          Custom rules are the right tool when you have a <strong style={{ color: C.text }}>discrete,
          categorical condition</strong> — "block all events from country X," or "review any transaction
          where the fraud score exceeds 60 AND the event type is withdrawal." These are hard rules, not
          probabilistic adjustments.
        </P>
        <P>
          Score tuning (adjusting thresholds in Settings → Risk Preferences) is better for
          <strong style={{ color: C.text }}> continuous adjustments</strong> — you want to accept slightly
          more risk across the board, or be more aggressive on a specific risk tier. Use rules for
          "always" and "never" logic; use thresholds for "usually."
        </P>

        <H2>Anatomy of a Genuinux rule</H2>
        <P>Every rule has three components:</P>
        <P>
          <strong style={{ color: C.text }}>Condition:</strong> A signal from the risk engine output
          or context (e.g., <Code>fraud_score</Code>, <Code>country</Code>,
          <Code>ip_user_count_1h</Code>) combined with an operator and value.
        </P>
        <P>
          <strong style={{ color: C.text }}>Action:</strong> The decision to take when the condition
          is met — <Code>allow</Code>, <Code>review</Code>, or <Code>block</Code>.
        </P>
        <P>
          <strong style={{ color: C.text }}>Status:</strong> Active or paused. Paused rules are
          evaluated but their action is not applied — useful for A/B testing a rule before enabling it.
        </P>

        <H2>Step-by-step: blocking a high-risk country</H2>
        <P>
          Let's say you're seeing a spike in fraud from a specific country, and you want to block
          all events from that country while you investigate. Here's how to do it:
        </P>
        <P>
          1. Open the dashboard and navigate to <strong style={{ color: C.text }}>Rules</strong> in
          the sidebar. Click <strong style={{ color: C.text }}>New rule</strong>.
        </P>
        <P>
          2. Give the rule a descriptive name: "Block — Country: [XX]" where XX is the ISO country code.
        </P>
        <P>
          3. Set the condition: Condition type → <Code>country</Code>, Operator → <Code>equals</Code>,
          Value → the two-letter country code (e.g., <Code>XX</Code>).
        </P>
        <P>
          4. Set the action to <Code>block</Code>. Leave status as <Code>active</Code>.
        </P>
        <P>
          5. Click Save. The rule is now active and will be applied to all subsequent risk checks.
        </P>
        <Callout>
          Rules are evaluated in creation order — oldest first. If multiple rules match an event,
          the first matching rule wins. Keep your most specific rules first and your catch-all rules last.
        </Callout>

        <H2>Example: velocity-based review rule</H2>
        <P>
          Here's a more nuanced example: flag for review any event where more than 5 distinct users
          have been seen from the same IP address in the last hour. This catches shared-proxy fraud
          without blocking legitimate corporate networks.
        </P>
        <CodeBlock>{`Rule name:      Shared proxy — flag for review
Condition type: ip_user_count_1h
Operator:       greater than
Value:          5
Action:         review
Status:         active`}</CodeBlock>

        <H2>Testing before you ship</H2>
        <P>
          Before activating a rule in production, set it to <strong style={{ color: C.text }}>paused</strong>.
          In paused state, the rule is evaluated and its match/no-match result is logged, but the action
          is not applied to the final decision.
        </P>
        <P>
          Run a sample of your recent events through the risk check endpoint and inspect the signals
          returned. If the rule would have matched events you consider legitimate, adjust the threshold.
          Only activate once you're confident the false positive rate is acceptable.
        </P>

        <H2>Available condition types</H2>
        <P>
          Genuinux supports the following condition types in custom rules:
          <Code>fraud_score</Code>, <Code>trust_score</Code>, <Code>risk_level</Code>,
          <Code>event_type</Code>, <Code>country</Code>, <Code>ip_user_count_1h</Code>,
          <Code>ip_signup_count_1h</Code>, <Code>device_user_count</Code>.
        </P>
        <P>
          More condition types are added with each release. Check the Rules modal for the current
          full list — the UI always reflects what the engine actually supports.
        </P>
      </>
    ),
  },
]

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const post = POSTS.find(p => p.slug === slug)

  if (!post) return <Navigate to="/" replace />

  const others = POSTS.filter(p => p.slug !== slug)

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>

      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-sm"
        style={{ background: 'rgba(248,250,252,0.9)', borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/">
            <img src="/logo-full.png" alt="Genuinux" style={{ height: '80px' }} />
          </Link>
          <Link to="/#blog"
            className="flex items-center gap-2 text-sm font-medium transition-colors"
            style={{ color: C.textSec }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}
          >
            <ArrowLeft size={15} />
            All articles
          </Link>
        </div>
      </nav>

      {/* Article */}
      <main className="max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: C.trustBg, color: C.trust, border: `1px solid ${C.trustBd}` }}>
              <Tag size={11} />
              {post.category}
            </span>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: C.textMut }}>
              <Clock size={11} />
              {post.readTime}
            </span>
          </div>

          <h1 className="font-bold mb-4 leading-tight"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', letterSpacing: '-0.03em', color: C.text }}>
            {post.title}
          </h1>

          <p className="text-lg leading-relaxed mb-6" style={{ color: C.textSec }}>
            {post.excerpt}
          </p>

          <div className="flex items-center gap-3 pt-5" style={{ borderTop: `1px solid ${C.border}` }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: C.trustBg, color: C.trust, border: `1px solid ${C.trustBd}` }}>
              G
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: C.text }}>Genuinux Team</p>
              <p className="text-xs" style={{ color: C.textSec }}>{post.date}</p>
            </div>
          </div>
        </header>

        {/* Divider */}
        <div className="mb-10" style={{ height: 1, background: C.border }} />

        {/* Body */}
        <article>{post.content}</article>

        {/* Footer CTA */}
        <div className="mt-16 p-8 rounded-2xl text-center"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <h3 className="font-bold text-xl mb-2" style={{ color: C.text }}>
            Start protecting your platform
          </h3>
          <p className="text-sm mb-6" style={{ color: C.textSec }}>
            Get started with Genuinux in under 5 minutes. No credit card required.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/register" className="btn-trust px-6 py-2.5 text-sm gap-2 rounded-xl inline-flex">
              Start 7-Day Trial
            </Link>
            <Link to="/docs"
              className="px-6 py-2.5 text-sm rounded-xl transition-colors"
              style={{ color: C.textSec, border: `1px solid ${C.border}` }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = C.trust)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
            >
              Read the docs
            </Link>
          </div>
        </div>

        {/* More articles */}
        {others.length > 0 && (
          <div className="mt-16">
            <p className="text-xs font-semibold uppercase tracking-wider mb-5"
              style={{ color: C.textMut }}>
              More articles
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {others.map(p => (
                <Link key={p.slug} to={`/blog/${p.slug}`}
                  className="p-5 rounded-xl transition-colors block"
                  style={{ background: C.surface, border: `1px solid ${C.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.trust)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: C.trust }}>
                    {p.category}
                  </span>
                  <p className="text-sm font-semibold mt-1.5 leading-snug" style={{ color: C.text }}>
                    {p.title}
                  </p>
                  <p className="text-xs mt-2" style={{ color: C.textSec }}>{p.date}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
