// TechCap Intelligence — website content.
// All copy and settings live here. Components are in scripts/site/components.mjs.
// After editing, run:  node scripts/build-site.mjs

export const config = {
  name: 'TechCap Intelligence',
  tagline: 'Making sense of European tech capital flows.',
  positioning:
    "Independent intelligence, strategic insights and ecosystem engagement for Europe's technology and investment landscape.",
  // Public address of the site, used for canonical links and the sitemap.
  baseUrl: 'https://www.techcapintelligence.com/',
  contact: {
    // TODO: replace with the final address, then set emailIsPlaceholder to false.
    email: 'hello@example.com',
    emailIsPlaceholder: true,
    // TODO: paste the full LinkedIn URLs. While empty, the site shows "link to be added".
    linkedinCompany: '',
    linkedinFounder: '',
  },
  // Weekly Roundup newsletter, used as the early-access sign-up.
  newsletterUrl: 'https://azizas-newsletter-11fef7.beehiiv.com/',
  founder: {
    // Optional. Leave empty to refer to "the founder" without a name.
    name: '',
  },
};

export const nav = [
  { href: 'platform.html', label: 'Intelligence Platform', short: 'Platform' },
  { href: 'research.html', label: 'Research & Insights', short: 'Research' },
  { href: 'engagement.html', label: 'Ecosystem Engagement', short: 'Engagement' },
  { href: 'about.html', label: 'About', short: 'About' },
];

// The three business lines. `key` picks the colour and the logo part used as its icon.
export const pillars = [
  {
    key: 'track',
    verb: 'track',
    object: 'the signals',
    title: 'Intelligence Platform',
    line: 'Follow the data. Understand the trends.',
    text: 'A lightweight intelligence terminal for European startup funding, investor activity, capital flows and the EU policy that shapes them.',
    href: 'platform.html',
    cta: 'Explore the platform',
  },
  {
    key: 'interpret',
    verb: 'interpret',
    object: 'the market',
    title: 'Research & Insights',
    line: 'Go beyond the numbers.',
    text: 'Ecosystem mapping, investment research and policy analysis, scoped to the market, sector or mandate you need to understand.',
    href: 'research.html',
    cta: 'See research services',
  },
  {
    key: 'connect',
    verb: 'connect',
    object: 'the ecosystem',
    title: 'Ecosystem Engagement',
    line: 'Connect the people shaping the ecosystem.',
    text: 'Panels, roundtables and introductions designed from market knowledge, so the right people have a conversation worth having.',
    href: 'engagement.html',
    cta: 'See engagement services',
  },
];

export const audiences = [
  {
    name: 'Investors',
    who: 'VC funds, corporate venture teams, business angels and investment institutions.',
    need: 'See where capital is moving, which sectors are emerging and who else is investing.',
  },
  {
    name: 'Founders',
    who: 'Early-stage and growth-stage startups raising in Europe.',
    need: 'Read fundraising trends, find relevant investors and navigate European funding instruments.',
  },
  {
    name: 'Corporates',
    who: 'Innovation, strategy, venture and technology scouting teams.',
    need: 'Track emerging technologies and startups, and meet the right innovation stakeholders.',
  },
  {
    name: 'Institutions',
    who: 'Public institutions, European programmes, innovation agencies and development finance institutions.',
    need: 'Ground programmes and policy in market evidence, ecosystem maps and investment research.',
  },
  {
    name: 'Ecosystem builders',
    who: 'Startup support organisations, research organisations and event organisers.',
    need: 'Understand their ecosystem, position it and bring its stakeholders together.',
  },
];

export const home = {
  title: 'TechCap Intelligence',
  description:
    "Independent intelligence, strategic insights and ecosystem engagement for Europe's technology and investment landscape. Live European startup funding data, research and ecosystem engagement.",
  hero: {
    eyebrow: 'TechCap Intelligence',
    headline: 'Making sense of European tech capital flows.',
    text: config.positioning,
    primary: { href: 'platform.html', label: 'Explore Intelligence' },
    secondary: { href: 'contact.html', label: 'Work With Us' },
  },
  proposition: {
    eyebrow: 'The proposition',
    headline: 'Turning fragmented information into actionable intelligence.',
    paragraphs: [
      "Europe's tech ecosystem is spread across dozens of countries, languages, funding programmes and data sources. Rounds are announced in national media. Investor activity sits in separate databases. Policy is published in Brussels and applied differently in every capital.",
      'TechCap Intelligence brings these signals together, checks them against their sources and explains what they mean, so you can act on a clear picture instead of assembling one yourself.',
    ],
    points: [
      { title: 'Understand the signals', text: 'One structured view of funding, investors, sectors and policy.' },
      { title: 'Identify opportunities', text: 'See which markets, stages and themes are gaining momentum.' },
      { title: 'Engage the right people', text: 'Meet the investors, founders and institutions behind the data.' },
    ],
  },
  pillars: {
    eyebrow: 'What we do',
    headline: 'Three business lines. One view of the market.',
    text: 'The data informs the research. The research shapes the conversations. The conversations surface what the data cannot show yet.',
  },
  tracking: {
    eyebrow: 'Coverage',
    headline: 'What we track',
    items: [
      { title: 'Startup funding and venture capital', text: 'Publicly announced rounds across Europe since 2021, by stage and instrument.' },
      { title: 'European technology markets', text: 'Funding by country and sector, with year-on-year comparisons.' },
      { title: 'Investor activity and capital flows', text: 'Who is investing, where, at which stage and how often.' },
      { title: 'Emerging technologies', text: 'AI, deeptech, energy, defence and the sectors gaining share.' },
      { title: 'EU innovation policy and funding frameworks', text: 'Programmes, instruments and regulation, and what they mean in practice.' },
      { title: 'Startup and innovation ecosystems', text: 'The organisations, hubs and institutions that make each market work.' },
    ],
  },
  audiences: {
    eyebrow: 'Who we work with',
    headline: 'Built for the people who allocate capital, build companies and shape policy.',
  },
  closing: {
    headline: 'Better intelligence. Stronger connections. Smarter decisions.',
    text: "Let's explore how we can work together.",
    cta: { href: 'contact.html', label: 'Start a conversation' },
  },
};

export const platform = {
  title: 'Intelligence Platform',
  description:
    'A lightweight intelligence terminal for European startup funding, investor activity, capital flows and EU policy. The funding dashboard is live; policy intelligence is in development.',
  hero: {
    eyebrow: 'Intelligence Platform',
    headline: 'Follow the data. Understand the trends.',
    text: 'A lightweight intelligence terminal for people who need to know where technology and investment are moving in Europe. It is built in the open and grows module by module.',
    primary: { href: 'dashboard.html', label: 'Open the live dashboard' },
    secondary: { href: 'contact.html#platform', label: 'Request early access' },
  },
  why: {
    eyebrow: 'Why capital flows',
    headline: 'A funding announcement is a data point. A capital flow is a signal.',
    paragraphs: [
      'A single round says little. Thousands of rounds, read together, show which sectors are attracting money, which countries are gaining ground, which stages are getting harder to raise and which investors are still writing cheques.',
      'The platform is built to answer those questions directly, with every figure traceable to its source.',
    ],
    questions: [
      'Where is capital going?',
      'Which sectors are attracting investment?',
      'Which geographies are gaining momentum?',
      'Which stages are attracting capital?',
      'What has changed in the European policy environment?',
    ],
  },
  modulesIntro: {
    eyebrow: 'Modules',
    headline: 'Four modules, built progressively.',
    text: 'Each module is labelled with its real status. Nothing is presented as live before it is.',
  },
  modules: [
    {
      letter: 'A',
      title: 'Startup and Investment Intelligence',
      status: 'live',
      statusLabel: 'Live',
      text: 'A structured view of the European startup and investment landscape, built on every publicly announced round since 2021.',
      features: [
        'Funding rounds, amounts and instruments',
        'Sector and technology breakdowns',
        'Funding map by country',
        'Investor activity and funds currently investing',
        'Stage trends and historical comparisons',
        'Exits and acquirers',
      ],
      link: { href: 'dashboard.html', label: 'Open the dashboard' },
    },
    {
      letter: 'B',
      title: 'European Tech Capital Flows',
      status: 'live',
      statusLabel: 'Live, expanding',
      text: 'The analytical layer on top of the rounds: how funding patterns shift between countries, sectors and stages over time.',
      features: [
        'Market outlook for any country and sector',
        'Country-to-country comparison',
        'Momentum and share of European tech',
        'Round sizes and typical ticket by stage',
        'New versus returning investors',
      ],
      link: { href: 'dashboard.html', label: 'See the market outlook' },
    },
    {
      letter: 'C',
      title: 'EU Policy and Funding Framework Intelligence',
      status: 'dev',
      statusLabel: 'In development',
      text: 'A curated tracker of the European policies, programmes and funding instruments that shape the startup ecosystem, connected to the funding data. Not a news feed.',
      features: [
        'Commission startup and scale-up initiatives',
        'Horizon Europe and EIC instruments',
        'InvestEU and related financial instruments',
        'Regulation affecting startups and investors',
        'Deeptech, AI and strategic technology initiatives',
      ],
      link: { href: 'contact.html#platform', label: 'Ask about early access' },
    },
    {
      letter: 'D',
      title: 'Market Signals and Intelligence Updates',
      status: 'partial',
      statusLabel: 'Live in part',
      text: 'A curated stream of developments, each with context on why it matters. Today: a daily scan of funding announcements and the weekly Roundup.',
      features: [
        'Significant funding announcements',
        'New investment vehicles',
        'Policy and regulatory updates',
        'Strategic partnerships',
        'Relevant reports and publications',
      ],
      link: { href: config.newsletterUrl, label: 'Get the weekly Roundup', external: true },
    },
  ],
  preview: {
    eyebrow: 'Platform preview',
    headline: 'What the terminal shows',
    text: 'Clean views, a few filters and a source on every figure. The numbers below come from the live dataset.',
  },
  // Structure of a policy tracker entry. Field descriptions only: no policy content is invented here.
  policySample: {
    title: 'Policy tracker entry',
    tag: 'Sample structure, not live data',
    fields: [
      { label: 'What changed', text: 'The initiative, programme or regulation, with its official source and date.' },
      { label: 'Who it affects', text: 'The sectors, stages and countries it could reach.' },
      { label: 'Instruments', text: 'The funding available, eligibility and deadlines.' },
      { label: 'Why it matters', text: 'Implications for founders and investors, labelled as analysis.' },
    ],
  },
  complement: {
    eyebrow: 'Data and policy',
    headline: 'Market data shows what happened. Policy shows what is coming.',
    text: 'Read separately, each tells half the story. The platform connects them.',
    rows: [
      { policy: 'A new programme or instrument is announced', market: 'Which sectors and stages it could reach, and how much they raise today' },
      { policy: 'A regulation changes', market: 'What it means for founders and investors in the affected markets' },
      { policy: 'A funding call opens', market: 'Which startups are eligible and which private investors are active alongside' },
    ],
  },
  benefits: {
    eyebrow: 'Who benefits',
    headline: 'One dataset, read from four positions.',
    items: [
      { name: 'Investors', text: 'Benchmark sectors and stages, track co-investors and spot markets gaining share.' },
      { name: 'Founders', text: 'See who is funding companies like yours, at what size, and which EU instruments apply.' },
      { name: 'Corporates', text: 'Follow emerging technologies and the startups and funds behind them.' },
      { name: 'Institutions', text: 'Measure where private capital goes and where public instruments could matter most.' },
    ],
  },
  closing: {
    headline: 'The platform is evolving. Early members help shape it.',
    text: 'Request early access to new modules, or tell us what you need to track.',
    cta: { href: 'contact.html#platform', label: 'Request early access' },
    secondary: { href: config.newsletterUrl, label: 'Get the weekly Roundup', external: true },
  },
};

export const research = {
  title: 'Research & Insights',
  description:
    'Market and ecosystem intelligence, investment and capital flow research, policy analysis and strategic advisory for investors, corporates, institutions and ecosystem organisations.',
  hero: {
    eyebrow: 'Research & Insights',
    headline: 'Go beyond the numbers.',
    text: 'Research and intelligence for organisations that need a deeper understanding of a technology market or an innovation ecosystem than a database can give them.',
    primary: { href: 'contact.html#research', label: 'Discuss a research project' },
  },
  intro: {
    eyebrow: 'Approach',
    headline: 'Scoped to your question, grounded in the data.',
    paragraphs: [
      'Every assignment starts from a specific question: a market to enter, a sector to assess, an investor landscape to map, a programme to design. The work combines the platform dataset with desk research, institutional sources and conversations with people in the market.',
      'Findings separate what the evidence shows from what we conclude from it, and every figure names its source.',
    ],
    tailoredTo: ['A market or geography', 'A sector or technology', 'An investment theme', 'An institutional mandate'],
  },
  services: [
    {
      letter: 'A',
      title: 'Market and Ecosystem Intelligence',
      text: 'Who is in a market, how it is structured and where it is heading.',
      items: [
        'Startup ecosystem mapping',
        'Market landscape assessments',
        'Technology and sector analysis',
        'Geographic market research',
        'Stakeholder and institutional mapping',
        'Emerging technology assessments',
      ],
    },
    {
      letter: 'B',
      title: 'Investment and Capital Flow Research',
      text: 'Where the money comes from, where it goes and who decides.',
      items: [
        'Venture capital landscape analysis',
        'Investor mapping and profiling',
        'Investment flow analysis',
        'Fundraising ecosystem assessments',
        'Access-to-finance research',
        'Trends by geography, sector and stage',
      ],
    },
    {
      letter: 'C',
      title: 'Policy and Regulatory Intelligence',
      text: 'What European policy means in practice for startups and investors.',
      items: [
        'Analysis of European innovation policies',
        'Mapping of funding frameworks and instruments',
        'Regulatory landscape monitoring',
        'Policy implications for startups and investors',
        'Research on public and private funding mechanisms',
      ],
    },
    {
      letter: 'D',
      title: 'Strategic Advisory and Intelligence Products',
      text: 'Research delivered in the format your team will use.',
      items: [
        'Bespoke research assignments',
        'Investment landscape reports',
        'Market intelligence briefs',
        'Investor and stakeholder databases',
        'Strategic presentations and executive briefings',
        'Ecosystem development strategies',
      ],
    },
  ],
  clients: {
    eyebrow: 'Who it is for',
    headline: 'Tailored to the organisation asking.',
    items: [
      { name: 'Investors', text: 'Landscape and co-investor analysis before entering a market or theme.' },
      { name: 'Corporates', text: 'Technology and startup scouting grounded in funding evidence.' },
      { name: 'Institutions', text: 'Ecosystem maps, access-to-finance studies and policy research for programme design.' },
      { name: 'Ecosystem organisations', text: 'Evidence to position an ecosystem and plan its development.' },
    ],
  },
  closing: {
    headline: 'Have a market, sector or theme you need to understand?',
    text: 'Tell us the question. We will come back with a scope.',
    cta: { href: 'contact.html#research', label: 'Discuss a research project' },
  },
};

export const engagement = {
  title: 'Ecosystem Engagement',
  description:
    'Panel and keynote design, moderation, investor and stakeholder roundtables, strategic introductions and ecosystem engagement initiatives, informed by market intelligence.',
  hero: {
    eyebrow: 'Ecosystem Engagement',
    headline: 'Connect the people shaping the ecosystem.',
    text: 'We design and lead conversations between investors, founders, corporates and institutions. They start from what the market data shows, so they produce knowledge, connections and opportunities.',
    primary: { href: 'contact.html#engagement', label: "Let's create meaningful conversations" },
  },
  difference: {
    eyebrow: 'The difference',
    headline: 'Market understanding, and the ability to bring the right people together.',
    paragraphs: [
      'Most panels fail before anyone speaks: the theme is broad, the speakers were chosen for their titles and the questions could be asked anywhere.',
      'We start from the intelligence. What is changing in this market? Who has a real stake in it? What do they disagree on? The format, the people and the questions follow from the answers.',
    ],
    outcomes: [
      { title: 'Knowledge', text: 'Discussions that surface something the room did not already know.' },
      { title: 'Connections', text: 'Introductions chosen for relevance, not for volume.' },
      { title: 'Opportunities', text: 'Partnerships and deals that start with the right conversation.' },
    ],
  },
  services: [
    {
      letter: 'A',
      title: 'Strategic Content and Conversation Design',
      text: 'The thinking before the event: what to discuss, with whom and to what end.',
      items: [
        'Panel discussion design',
        'Keynote and fireside chat concepts',
        'Themes and discussion angles',
        'Moderator briefs and discussion frameworks',
      ],
    },
    {
      letter: 'B',
      title: 'Moderation and Thought Leadership',
      text: 'An informed moderator who knows the market and keeps the conversation useful.',
      items: [
        'Panel and roundtable moderation',
        'Fireside chats with founders, investors and executives',
        'Investor and corporate discussions',
        'Keynotes and ecosystem presentations',
      ],
    },
    {
      letter: 'C',
      title: 'Stakeholder Engagement and Connections',
      text: 'Finding the people who should be talking and making the introduction count.',
      items: [
        'Identifying relevant ecosystem stakeholders',
        'Curated interactions between investors, startups, corporates and institutions',
        'Strategic introductions',
        'Partnership development support',
      ],
    },
    {
      letter: 'D',
      title: 'Ecosystem Activation',
      text: 'Formats that turn a network into working relationships.',
      items: [
        'Investor roundtables',
        'Thematic workshops',
        'Closed-door discussions',
        'Innovation ecosystem sessions',
        'International ecosystem exchanges',
        'Strategic stakeholder convenings',
      ],
    },
  ],
  note: {
    headline: 'Strategy and content, not logistics.',
    text: 'We are not an event agency. We work with your organising team or venue partner and focus on the part that decides whether the conversation is worth attending: the theme, the people and the questions.',
  },
  closing: {
    headline: "Let's create meaningful conversations.",
    text: 'Planning a conference session, a roundtable or a stakeholder convening? Tell us who needs to be in the room.',
    cta: { href: 'contact.html#engagement', label: 'Discuss an engagement' },
  },
};

export const about = {
  title: 'About',
  description:
    'TechCap Intelligence is an independent technology and investment intelligence venture focused on the European startup and innovation ecosystem.',
  hero: {
    eyebrow: 'About',
    headline: 'An independent view of European tech and investment.',
    text: 'TechCap Intelligence is an independent venture. It exists to become a go-to intelligence and engagement resource for people and organisations navigating Europe’s technology and investment landscape.',
  },
  why: {
    eyebrow: 'Why it exists',
    headline: 'The information exists. The picture does not.',
    paragraphs: [
      'Data on European startups, venture capital, investors, technologies and regulation is published every day, across databases, reports, institutions and national media. Few people have the time to connect it.',
      'TechCap Intelligence does that work: it collects and structures the signals, interprets them, and brings together the people they concern.',
    ],
  },
  foundations: {
    eyebrow: 'Foundations',
    headline: 'What the venture is built on',
    items: [
      'Technology ecosystem experience',
      'Investment and fundraising intelligence',
      'International market research',
      'Startup ecosystem development',
      'Stakeholder engagement',
      'Strategic communications and thought leadership',
    ],
  },
  founder: {
    eyebrow: 'Experience',
    headline: 'Nine years inside technology and innovation ecosystems.',
    paragraphs: [
      'The founder brings 9 years of experience across technology, innovation and emerging-market ecosystems, working with investors, startups, corporates, international institutions and innovation organisations.',
      'That experience includes work with organisations such as Briter, Expertise France and Station F, as well as engagements involving international organisations and institutions.',
    ],
    organisations: ['Briter', 'Expertise France', 'Station F'],
    disclaimer:
      'These organisations are named as past professional experience. They do not endorse and are not affiliated with TechCap Intelligence.',
  },
  principles: {
    eyebrow: 'How we work',
    headline: 'Four working rules',
    items: [
      { title: 'Every number has a source', text: 'Figures name the data behind them. Undisclosed amounts stay undisclosed and are never estimated.' },
      { title: 'Analysis is labelled as analysis', text: 'What the evidence shows and what we conclude from it are kept apart.' },
      { title: 'Independent', text: 'No investor, institution or programme owns the venture or its conclusions.' },
      { title: 'Europe, defined', text: 'Country views cover the EU27, the UK, Switzerland, Norway and Iceland. Amounts are in euros at the ECB reference rate.' },
    ],
  },
  closing: {
    headline: 'Better intelligence. Stronger connections. Smarter decisions.',
    text: "Let's explore how we can work together.",
    cta: { href: 'contact.html', label: 'Get in touch' },
  },
};

export const contact = {
  title: 'Contact',
  description:
    'Contact TechCap Intelligence about platform early access, research and advisory projects, ecosystem engagement or general enquiries.',
  hero: {
    eyebrow: 'Contact',
    headline: "Let's explore how we can work together.",
    text: 'Choose the type of enquiry and tell us briefly what you need. You will get a reply from a person, not a sales sequence.',
  },
  // `id` is used in links such as contact.html#research to preselect the enquiry type.
  types: [
    { id: 'general', label: 'General enquiry', text: 'Questions, partnerships and press.' },
    { id: 'research', label: 'Research and advisory', text: 'A market, sector or theme you need to understand.' },
    { id: 'platform', label: 'Platform early access', text: 'Early access to new modules, or data you need tracked.' },
    { id: 'engagement', label: 'Ecosystem engagement', text: 'Panels, moderation, roundtables and introductions.' },
  ],
};
