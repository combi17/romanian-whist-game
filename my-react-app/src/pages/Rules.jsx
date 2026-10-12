import React from 'react';
import { Link } from 'react-router-dom';
import { MIN_PLAYERS, MAX_PLAYERS, MAX_HAND_SIZE, STREAK_TEXT } from '../game/rulesText.js';
import './Rules.css';

/**
 * The rules as this engine enforces them. House rules vary between tables, so
 * the page notes where common variants differ.
 */
function Rules() {
  return (
    <div className="rules">
      <header className="rules__top">
        <Link to="/" className="rules__back">
          ← Whist Arena
        </Link>
        <Link to="/demo" className="rules__practice">
          Try it against bots
        </Link>
      </header>

      <article className="rules__body">
        <p className="rules__eyebrow">House rules</p>
        <h1 className="rules__title">How we play</h1>
        <p className="rules__lede">
          Romanian Whist for {MIN_PLAYERS} to {MAX_PLAYERS} players. You predict exactly how
          many tricks you will win, and you are punished for being wrong in either direction.
          That is the whole game.
        </p>

        <Section n="1" title="The deck">
          <p>
            The deck is trimmed to the table so that everyone can always be dealt{' '}
            {MAX_HAND_SIZE} cards: two ranks per player, per suit.
          </p>
          <div className="rules__table-wrap">
            <table className="rules__table">
              <thead>
                <tr>
                  <th>Players</th>
                  <th>Cards</th>
                  <th>Ranks in play</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>3</td><td>24</td><td>9 10 J Q K A</td></tr>
                <tr><td>4</td><td>32</td><td>7 8 9 10 J Q K A</td></tr>
                <tr><td>5</td><td>40</td><td>5 6 7 8 9 10 J Q K A</td></tr>
                <tr><td>6</td><td>48</td><td>3 4 5 6 7 8 9 10 J Q K A</td></tr>
              </tbody>
            </table>
          </div>
          <p>Aces are high. Suits have no rank of their own — only trump matters.</p>
        </Section>

        <Section n="2" title="The shape of a game">
          <p>
            With <em>N</em> players the hand sizes run:
          </p>
          <p className="rules__plan">
            N rounds of 1 &nbsp;→&nbsp; 2, 3, 4, 5, 6, 7 &nbsp;→&nbsp; N rounds of 8
            &nbsp;→&nbsp; 7, 6, 5, 4, 3, 2 &nbsp;→&nbsp; N rounds of 1
          </p>
          <p>
            That is 3N + 12 rounds: <strong>21</strong> at three players, <strong>24</strong> at
            four, <strong>27</strong> at five, <strong>30</strong> at six.
          </p>
          <Aside>
            There is no dealer. The game tracks one rotating seat — the first bidder, who also
            leads the first trick — and it moves one place clockwise every round.
          </Aside>
        </Section>

        <Section n="3" title="Trump">
          <p>
            After the deal, the next card off the deck is turned face up in the middle of the
            table. Its suit is trump for the round.
          </p>
          <p>
            In the 8-card rounds the deck runs out exactly, so there is no card left to turn.
            Those rounds are played <strong>with no trump</strong>: highest card of the led suit
            takes it, every time.
          </p>
        </Section>

        <Section n="4" title="Bidding">
          <p>
            Going clockwise from the first bidder, everyone says how many tricks they expect to
            take, from 0 up to the number of cards in hand. Bids are public and stay on the
            table for the whole round.
          </p>
          <p className="rules__rule">
            <strong>Nu se poate.</strong> The last player to bid may not choose the number that
            would make the bids add up to exactly the number of cards in hand. Somebody always
            has to be wrong.
          </p>
          <p>
            That one value is greyed out for you, and your name plate turns red while you are
            the last to bid — so you know before you look at your cards.
          </p>
        </Section>

        <Section n="5" title="Playing a trick">
          <ul className="rules__list">
            <li>The first bidder leads the first trick; whoever wins a trick leads the next.</li>
            <li><strong>Follow the led suit if you can.</strong></li>
            <li>
              <strong>If you cannot follow, you must play a trump</strong> — if you hold one.
            </li>
            <li>
              <strong>Any trump will do.</strong> There is no obligation to beat a trump already
              on the table. Holding ♠9 and ♠3 over an opponent's ♠7, you may throw the ♠3 and
              let them have it.
            </li>
            <li>If you can neither follow nor trump, play whatever you like.</li>
          </ul>
          <p>
            Highest trump wins. If nobody trumped, the highest card of the led suit wins.
          </p>
          <Aside>
            Cards you cannot legally play are greyed out, so you cannot break these by accident.
          </Aside>
        </Section>

        <Section n="6" title="Scoring">
          <div className="rules__table-wrap">
            <table className="rules__table">
              <thead>
                <tr>
                  <th>Outcome</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Took exactly what you bid</td>
                  <td className="is-good">+5, plus 1 per trick</td>
                </tr>
                <tr>
                  <td>Missed, either way</td>
                  <td className="is-bad">−1 per trick of difference</td>
                </tr>
                <tr>
                  <td>Five correct bids in a row</td>
                  <td className="is-good">+10</td>
                </tr>
                <tr>
                  <td>Five missed bids in a row</td>
                  <td className="is-bad">−10</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="rules__rule">
            <strong>{STREAK_TEXT}</strong>
          </p>
          <p>
            Overshooting costs you as much as falling short. Bid 2 and take 4, and you lose 2 —
            there is no prize for winning tricks you did not promise.
          </p>
        </Section>

        <Section n="7" title="Winning">
          <p>Highest total after the last round wins. With one exception:</p>
          <p className="rules__zero">
            Finish on exactly <strong>0</strong> points and you win outright, no matter how far
            ahead anyone else is.
          </p>
          <p>
            Zero can be reached from below — sitting on −3 and scoring +3 in the final round
            lands you on nothing at all, and takes the game. If two players finish on zero, the
            one with more exactly-matched bids across the game takes it.
          </p>
          <Aside>
            A total of exactly zero is highlighted everywhere it appears, so you can see it
            coming.
          </Aside>
        </Section>

        <Section n="8" title="Blind rounds (optional)">
          <p>
            The host can switch this on before the game starts. When it is on, every 1-card
            round is played <strong>blind</strong>: you hold your single card facing outward.
            Everyone can see it except you.
          </p>
          <p>
            You still bid 0 or 1 in the normal order — you are just reading the other cards on
            the table instead of your own.
          </p>
        </Section>

        <Section n="9" title="Leaving and coming back">
          <p>
            If you lose connection or close the tab, your seat waits fifteen seconds and then a
            bot plays it so nobody is stuck staring at the table. Open the room link again and
            you take the seat straight back, mid-round, exactly where play has got to.
          </p>
          <p>
            The host can also add bots deliberately in the lobby. Two friends and three bots is a
            perfectly legal five-handed game.
          </p>
        </Section>

        <footer className="rules__footer">
          <Link to="/demo" className="rules__cta">
            Play a practice game
          </Link>
          <Link to="/" className="rules__back">
            Back to the front
          </Link>
        </footer>
      </article>
    </div>
  );
}

function Section({ n, title, children }) {
  return (
    <section className="rules__section">
      <h2 className="rules__h2">
        <span className="rules__num">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Aside({ children }) {
  return <p className="rules__aside">{children}</p>;
}

export default Rules;
