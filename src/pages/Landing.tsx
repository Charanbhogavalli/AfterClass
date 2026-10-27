import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { Tag } from '../components/ui/Tag';
import { DEMO_LEADERBOARD, DEMO_POLL, DEMO_QUIZ, DEMO_SUGGESTION } from '../data/demo';

export function Landing() {
  return (
    <>
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 pt-12 pb-16 sm:px-8 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <Tag tone="lime">Chinmaya Vishwa Vidyapeeth</Tag>
          <h1 className="mt-6 font-display text-5xl leading-[1.02] font-bold tracking-tight sm:text-7xl">
            Your campus.
            <br />
            <span className="italic text-violet">Your curiosity.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-soft">
            A daily technology quiz, a points race with your batchmates, campus polls and a place to suggest what
            should change. Learn something small every day and see where you stand.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link to="/sign-in">
              <Button>Sign in with college Google</Button>
            </Link>
            <p className="text-sm text-ink-soft">Verified college accounts only.</p>
          </div>
          <p className="mt-6 inline-block rounded-full bg-sand px-4 py-2 text-sm font-semibold">
            Restricted to <span className="font-mono">@cvv.ac.in</span> accounts
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md pb-24">
          <Card tone="pink" rotate="left">
            <Tag>{DEMO_QUIZ.label}</Tag>
            <h2 className="mt-4 font-display text-2xl leading-snug">{DEMO_QUIZ.title}</h2>
            <p className="mt-3 font-semibold">{DEMO_QUIZ.question}</p>
            <ul className="mt-4 grid grid-cols-2 gap-3" aria-label="Sample answer options">
              {DEMO_QUIZ.options.map((option) => (
                <li key={option} className="rounded-2xl border-2 border-ink bg-paper px-4 py-3 text-center font-bold">
                  {option}
                </li>
              ))}
            </ul>
          </Card>
          <Card tone="lime" rotate="right" className="absolute right-0 bottom-0 w-60">
            <p className="text-xs font-bold tracking-widest uppercase">Leaderboard preview</p>
            <ol className="mt-3 space-y-2">
              {DEMO_LEADERBOARD.map((row) => (
                <li key={row.rank} className="flex justify-between gap-2 text-sm font-semibold">
                  <span>
                    {row.rank}. {row.name}
                  </span>
                  <span className="tabular-nums">{row.points}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Section id="quiz" eyebrow="Every day" title="One question. Real explanations.">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <h3 className="font-display text-xl font-bold">Answer today's quiz</h3>
            <p className="mt-2 text-ink-soft">
              One attempt per quiz. Your score is calculated on the server, and explanations follow your answer.
            </p>
          </Card>
          <Card tone="violet" rotate="right" className="md:translate-y-6">
            <h3 className="font-display text-xl font-bold">Keep your streak</h3>
            <p className="mt-2">Come back on consecutive days. A streak only counts days you actually completed.</p>
          </Card>
          <Card rotate="left">
            <h3 className="font-display text-xl font-bold">Learn, then compare</h3>
            <p className="mt-2 text-ink-soft">Points come from correct answers only. Ties are broken by an earlier completion time.</p>
          </Card>
        </div>
      </Section>

      <Section id="leaderboard" eyebrow="Friendly competition" title="Points, ranked fairly.">
        <p className="max-w-2xl text-ink-soft">
          The leaderboard uses points the server awards. Students can't edit their own scores, and your own position
          stays visible even when you're outside the top list.
        </p>
      </Section>

      <Section id="polls" eyebrow="Campus voice" title="Polls and suggestions.">
        <div className="grid gap-6 md:grid-cols-2">
          <Card tone="lime">
            <Tag>{DEMO_POLL.label}</Tag>
            <p className="mt-4 font-display text-2xl">{DEMO_POLL.question}</p>
            <ul className="mt-4 space-y-2">
              {DEMO_POLL.options.map((option) => (
                <li key={option} className="rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-semibold">
                  {option}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-semibold">One vote per student. Results follow each poll's visibility rule.</p>
          </Card>
          <Card tone="pink" rotate="right">
            <Tag>{DEMO_SUGGESTION.label}</Tag>
            <p className="mt-4 text-lg">&ldquo;{DEMO_SUGGESTION.text}&rdquo;</p>
            <p className="mt-6 text-sm font-semibold">Suggestions are reviewed by campus admins and get a visible status.</p>
          </Card>
        </div>
      </Section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-8">
        <Card tone="violet" className="text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Built for the CVV community.</h2>
          <p className="mx-auto mt-3 max-w-xl">
            Access is limited to approved college accounts. Anyone can read this page, but quizzes, polls and profiles
            are only for the community.
          </p>
        </Card>
      </section>
    </>
  );
}
