[[Español|Ciencia-detrás]] · **English**

# The science behind it: life that invents itself

Bioluma's creatures **are not drawn**. They are born from a math rule. This page tells you how, in plain words. At the end there is a little corner for the curious.

## The idea in 30 seconds

Imagine a huge board of little squares. Each square is a tiny **light** with a brightness from **0** (off) to **1** (very bright).

At every moment, each light **looks at its neighbours** and thinks: *"do I like what I see?"*

- If it sees **just what it likes**, it glows a little brighter.
- If it sees **too much** or **too little**, it dims a little.

That happens in every square at the same time, again and again, about 30 times a second.

And what comes out? Suddenly **blobs of light that move on their own** appear. They swim, spin, pulse and even split in two. Those are the creatures. **Nobody told them how to move.** They come out of the rule.

> Scientists call this **emergence**: complicated things born from very simple rules. Like a flock of birds that nobody leads.

## What μ and σ are

When you move the sliders in **Calibrate**, you change these numbers:

| Letter | Said | Means… |
|---|---|---|
| **μ** | "mu" | **What the light likes.** How much neighbour brightness feels perfect. |
| **σ** | "sigma" | **How picky it is.** With a small σ it only accepts something very precise. With a big σ it accepts almost anything. |
| **R** | "R" | **How far it looks.** The size of the ring of neighbours. With a bigger R, creatures are bigger. |
| **dt** | "dee tee" | **How fast time passes** in each step. Too high breaks delicate creatures. |

Every pair of μ and σ is **a different universe**, with its own critters. That is why changing the rules is the fastest way to discover new species.

## Who invented this?

**Lenia** was created by **Bert Wang-Chak Chan**. It is like the famous *Game of Life* by Conway, but instead of squares that turn on or off, it uses **soft brightness** and **soft time**. That is why the creatures look alive, not like pixels.

Bert Chan found hundreds of creatures and put them in a **catalog** with Latin names, like *Orbium unicaudatus*. Bioluma uses **26** of them, with their original names and numbers.

- Lenia code and catalog: [github.com/Chakazul/Lenia](https://github.com/Chakazul/Lenia)
- Paper: *Lenia: Biology of Artificial Life.* Complex Systems 28(3), 2019. [arXiv:1812.05433](https://arxiv.org/abs/1812.05433)
- Paper: *Lenia and Expanded Universe.* ALIFE 2020. [arXiv:2005.03742](https://arxiv.org/abs/2005.03742)

Thank you, Bert! More thanks in [[Credits|Credits-en]].

## What Bioluma adds

- **The rule runs on the graphics card** of your phone or computer (with a technology called WebGL2), about 30 times a second.
- A **detector** looks at the dish every few steps and asks: is this alive? did it blow up? does it swim? spin? divide?
- The **economy** turns *shape* into **Essence**: a well-formed creature is worth a lot; a shapeless blob, nothing.
- **Seeds** carry a bit of luck and, early on, a nudge towards the creature that lives best under the rules of that moment. That makes seeding exciting instead of frustrating.
- **All sound** is made on the spot: there are no recordings.

> **Is it exact science?** It is a **game**. Fun first, accuracy second. But the life you see is real: it comes from the simulation, not from an animation.

## Mini experiments

1. **Move μ very slowly** in Calibrate and watch a swimming creature. Does it melt? Does it change shape?
2. **Watch a creature leave one side** of the dish and come back in through the other. The dish is like a donut.
3. **Seed twice on the same spot.** Do they come out the same? (Spoiler: almost never.)
4. **Make something divide**, and watch the dish fill up!

## For the curious: the formula

At each step, the new brightness of each square is:

```
A(new) = clip_between_0_and_1( A + dt · G( K * A ) )
```

- **K** is a **ring** of radius R that sums to 1. Each neighbour weighs according to its distance. The ring profile is `(4·r·(1−r))⁴`, with `r` between 0 and 1.
- **K \* A** is what the light "sees": the weighted average of its neighbours' brightness.
- **G** is the growth function: `G(u) = 2·max(0, 1 − (u − μ)² / (9σ²))⁴ − 1`. It is +1 when `u = μ` (grows) and falls to −1 when `u` moves away (dims).
- **dt** is the time step.

Bioluma uses **exactly these functions by Chan**, so the catalog numbers work unchanged. A CPU version (with FFT) is used in tests to check that the graphics card does the same thing. Details in [`DECISIONS.md`](https://github.com/ronalc90/Lenia/blob/main/DECISIONS.md) (ADR-002 and ADR-013) and in [[Development|Development-en]].

**[▶ Go experiment!]({{GAME_URL}})**
