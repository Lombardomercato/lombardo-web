# LOMBARDO — Design System

Version: 2.0

This document defines the visual and UI system for the Lombardo website.
It must be used together with:
- brand-guidelines.md
- website-structure.md
- content-copy.md
- ai-instructions.md
- project-context.md
- lombardo-ai-design-system.json

---

# 1. Design Direction

The Lombardo website must feel:

- warm
- modern
- accessible
- editorial
- social
- memorable
- premium but not elitist

It should combine:
- local identity
- strong typography
- color confidence
- clean layouts
- practical usability

Avoid:
- luxury hotel style
- dark generic wine-store aesthetics
- startup SaaS design language
- visual clutter
- over-animated interfaces

---

# 2. Layout Principles

Use a centered responsive layout.

Recommended max content width:
1280px

Recommended inner content width:
1120px to 1200px depending on section

Container padding:
- desktop: 32px
- tablet: 24px
- mobile: 16px

Section spacing:
- desktop: 112px
- tablet: 80px
- mobile: 56px

Use generous white/negative space.
The site must breathe.

---

# 3. Grid System

Desktop:
12-column grid

Tablet:
8-column grid

Mobile:
4-column or single-column stack

Use the grid to create rhythm and hierarchy, not density.

---

# 4. Color System

Use only official brand colors:

- #003A70
- #D4EB8E
- #FFB3AB
- #E4D5D3
- #E03C31

## Recommended usage

### #003A70
Use for:
- nav
- footer
- strong backgrounds
- institutional or elegant sections
- secondary buttons
- wine / brand blocks

### #E03C31
Use for:
- primary CTA
- hero emphasis
- badges
- highlighted statements
- key interactions

### #E4D5D3
Use for:
- neutral backgrounds
- warm surfaces
- cards
- base sections

### #FFB3AB
Use for:
- softer backgrounds
- coffee-related blocks
- friendly accents
- light feature sections

### #D4EB8E
Use for:
- subtle accent details only
- tags
- small highlights
- promotional micro-elements

Rules:
- keep contrast strong
- avoid rainbow combinations in a single screen
- do not use all colors with equal weight
- prioritize clarity and brand recognition

---

# 5. Typography System

## Display font
Gopher

Usage:
- H1
- H2
- H3
- hero lines
- featured claims
- short CTA emphasis

Rules:
- ALWAYS UPPERCASE
- never lowercase
- never in long paragraphs
- slightly open tracking
- keep lines concise

Recommended CSS:
- text-transform: uppercase;
- letter-spacing: 0.04em to 0.08em;

## Body font
Articulat CF

Usage:
- paragraphs
- descriptions
- nav
- buttons
- menu items
- practical info
- forms
- cards
- event details

---

# 6. Typography Scale

Suggested scale:

## H1
Gopher Bold
Clamp around 44px–72px

## H2
Gopher Bold
Clamp around 32px–52px

## H3
Gopher Medium or Bold
Clamp around 24px–36px

## Body L
Articulat CF
18px

## Body
Articulat CF
16px–18px

## Small UI
Articulat CF Demi Bold or Normal
14px–16px

Line height:
- Body: 1.5 to 1.7
- Headings: tighter and controlled

---

# 7. Component System

## Header / Navigation
Must include:
- logo
- main menu
- CTA to Carta
- CTA to Contacto or WhatsApp

Behavior:
- sticky or semi-sticky
- clear contrast
- mobile menu accessible and simple

## Hero
Must include:
- brand statement
- claim or supporting phrase
- primary CTA
- secondary CTA
- strong visual or brand color background

Tone:
- bold
- welcoming
- memorable
- immediate

## Buttons

### Primary
Background: #E03C31
Text: #E4D5D3 or high-contrast equivalent

### Secondary
Background: #003A70
Text: #E4D5D3

### Outline / tertiary
Transparent or light surface
Border/text in #003A70

Buttons should feel solid, confident and simple.
Do not over-style them.

## Cards
Use for:
- menu items
- experience highlights
- events
- club benefits
- featured products

Style:
- simple
- readable
- warm surfaces
- subtle depth if needed
- not glassmorphism
- not over-rounded

## Menu / Carta modules
The digital menu must be easy to scan and update.

Support:
- section headings
- categories
- descriptions
- optional prices
- combos
- tags
- highlights

It must work extremely well on mobile.

## Gallery
Preferred styles:
- refined grid
- masonry
- alternating editorial layout

Must feel:
- real
- atmospheric
- curated

## Map block
Must include:
- embedded map
- address
- city / region
- hours
- CTA to WhatsApp or location directions

## Ecommerce placeholder
Must include:
- a clear section saying future online store / tienda
- categories preview
- soft coming soon messaging
- no broken or fake commerce flows

---

# 8. Image Treatment

Use imagery to reinforce:
- café
- vino
- productos
- encuentros
- balcón
- mercado / delicatessen
- interior del local
- shared tables
- real moments

Image rules:
- large crops are welcome
- keep warmth
- avoid excessive filters
- preserve authenticity

---

# 9. Page Behavior and UX

The site must balance storytelling and utility.

Primary user tasks:
- understand what Lombardo is
- see the menu
- discover café and wine offer
- explore experiences and events
- join Club Lombardo
- contact the business
- find the location easily

The site must not hide practical information.

---

# 10. Responsive Rules

On mobile:
- stack content clearly
- keep type readable
- do not overload hero
- prioritize Carta, Contacto and Ubicación
- make buttons easy to tap
- keep navigation short and accessible
- digital menu must remain comfortable to scroll

The mobile experience must feel premium and practical.

---

# 11. Accessibility and Clarity

Minimum rules:
- proper heading hierarchy
- sufficient contrast
- meaningful alt text
- semantic HTML structure
- visible focus states
- accessible nav and buttons
- readable text over images

---

# 12. Technical Output Expectations

Codex / Cursor should produce:
- clean semantic HTML
- clean organized CSS
- minimal JS only when needed
- reusable sections and patterns
- architecture ready to scale

Recommended output:
- index.html
- carta.html
- cafe.html
- vinos.html
- experiencias.html
- eventos.html
- club.html
- galeria.html
- contacto.html
- tienda.html
- css/style.css
- js/script.js

If a one-page architecture is preferred initially, these sections must still exist clearly in the site and be easily splittable into future pages.
