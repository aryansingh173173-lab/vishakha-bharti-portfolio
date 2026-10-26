// Single source of truth for all portfolio content.
// Both portfolio mode and 3D mode read from here (see DESIGN.md section 2).
// Images live in assets/img/<id>.jpg (preview) and assets/img/hd/<id>.jpg (viewer),
// produced by tools/extract.py.

export const person = {
  name: 'Vishakha Bharti',
  title: 'Architectural Portfolio',
  tagline: 'Beyond the Conventional',
  years: '2023 – 2026',
  role: 'B.Arch, Indian Institute of Technology Kharagpur',
  portrait: 'about-portrait',
  about: [
    'I am Vishakha Bharti, a fourth-year student doing my Bachelors in Architecture at IIT Kharagpur, and I am still learning what it means to truly listen to a space. Architecture, for me, is not simply about building — it is about understanding the quiet negotiations between people and the places they inhabit, between structure and sky, between what a site demands and what a person needs.',
    'I am drawn to the moments where design becomes almost invisible — where a threshold feels natural, where light falls exactly as it should, where a room holds its occupant without announcing itself. I want to understand how those moments are made, and how to make them deliberately.',
    'I sketch because thinking slows down when my hand moves. I observe because every built thing has an argument embedded in it. And I design because I believe that space, at its most honest, can hold the full complexity of a human life.',
  ],
  education: [
    { years: '2023 – Present', title: 'Bachelor of Architecture', place: 'Indian Institute of Technology Kharagpur', note: 'CGPA 8.4' },
    { years: '2020 – 2022', title: 'Higher Secondary Education', place: 'Sanfort World School, Moradabad' },
    { years: '2012 – 2020', title: 'Secondary Education', place: 'S S Children Academy Girls School, Moradabad' },
  ],
  experience: [
    { years: 'May – Aug 2026', title: 'Architectural and Interior Design Intern', place: 'SoCH Studio of Creative Heads, Gurugram', note: 'CAD drawings, interior concepts and mood boards, 3D models and visualisations, client meetings.' },
    { years: 'May – Jul 2025', title: 'Product and Architectural Intern', place: 'Veshmn Innovation Private Limited, Gurugram', note: 'Design databases, 10+ 3D models and visualisations, client-ready presentations.' },
  ],
  awards: [
    '1st Place — D24, 24-hour design challenge, Dept. of Architecture & Regional Planning, IIT Kharagpur',
    '1st Position — Earthquake-Resistant Architectural and Structural Design, IIT Kharagpur',
    '2nd Prize — Time-Constrained Design Test, IIT Kharagpur × Jadavpur University',
    '3rd Prize — Time-Constrained Design Test, IIT Kharagpur × IIEST Shibpur',
    'ZONASA delegate for IIT Kharagpur, 2024 and 2025',
  ],
  software: ['AutoCAD', 'SketchUp', 'Rhino', 'Revit', 'D5', 'Enscape', 'V-Ray', 'Lumion', 'Photoshop', 'Illustrator', 'InDesign'],
  contact: {
    email: 'vishakha8642@gmail.com',
    linkedin: 'https://www.linkedin.com/in/vishakha-bharti-54b9b2292/',
    instagram: 'https://www.instagram.com/_vishakha_1_/',
    instagramHandle: '_vishakha_1_',
  },
  pdf: { href: 'assets/Vishakha-Bharti-Portfolio.pdf', size: '18.5 MB' },
  signoff: 'Until the next idea!',
};

export const projects = [
  {
    id: 'thendral-marabu',
    number: '01',
    title: 'Thendral Marabu',
    type: 'Beach Resort',
    location: 'Chennai, Tamil Nadu',
    category: 'Academic work',
    detail: 'pergola',
    // her SketchUp model: shown in 3D as its own stop after the pavilion (assets/models/buildings/),
    // and the original .skp to open in SketchUp. `skp.href` can be a Google Drive share link instead.
    model: 'resort',
    skp: { href: 'assets/models/skp/thendral-marabu.skp', size: '10.5 MB' },
    hero: 'resort-aerial',
    walls: ['resort-courtyard', 'resort-views'],
    summary: 'A coastal resort shaped to catch the Thendral — the sea wind — through every verandah, corridor and courtyard.',
    intro: [
      "In a coastal city where the relationship between people and the sea is ancient and unhurried, this resort was designed not as an escape from place but as a deeper entry into it. Chennai's shoreline carries a particular quality of wind — the Thendral — that moves through coconut groves, fishing villages, and temple courtyards before it reaches the water's edge. This resort was designed to catch that wind deliberately, to let it move through every corridor, every verandah, every shaded outdoor space as though the building had always been a part of the landscape it sits within.",
      'Thendral Marabu is not simply a place to stay. It is an attempt to translate the rhythm of coastal Tamil heritage into built form — where materiality, orientation, and spatial sequence together tell the story of a shoreline that has been lived in for centuries. A resort where arriving feels less like checking in and more like coming home to something you did not know you remembered.',
    ],
    sections: [
      {
        items: [
          { id: 'resort-aerial', caption: 'Aerial view — cottages along the shore', kind: 'render' },
          { id: 'resort-courtyard', caption: 'Courtyard garden at dusk', kind: 'render' },
          { id: 'resort-views', caption: 'Views across the resort', kind: 'render' },
          { id: 'resort-concept', caption: 'Concept — heritage, nature, tranquility', kind: 'board' },
          { id: 'resort-siteplan', caption: 'Site plans', kind: 'drawing' },
          { id: 'resort-sections', caption: 'Sections AA′, BB′, CC′', kind: 'drawing' },
        ],
      },
    ],
  },
  {
    id: 'banglar-shilpo-ghar',
    number: '02',
    title: 'Banglar Shilpo Ghar',
    type: 'Museum of Folk Craft',
    location: 'Kolkata, West Bengal',
    category: 'Academic work',
    detail: 'lattice',
    model: 'museum',
    skp: { href: 'assets/models/skp/banglar-shilpo-ghar.skp', size: '7.3 MB' },
    hero: 'museum-exterior',
    walls: ['museum-lattice', 'museum-elevations'],
    summary: "A house for Bengal's folk crafts — terracotta, bamboo screens and courtyards, unfolding as three sensory galleries.",
    intro: [
      "In a country where folk art does not hang in galleries but lives in the hands of the people who make it, this museum was designed to close that distance. Banglar Shilpo Ghar, the House of Bengal's Craft, is rooted in the visual language of the land it celebrates: terracotta patterns borrowed from temple facades, bamboo screens that filter light the way a Kantha stitch filters colour, open courtyards that echo the rhythm of a village maidan.",
      'The building is organised around three galleries — Folk Art, Folk Music, and Folk Handcraft — each unfolding as a sensory journey rather than a simple display. Light, texture, sound, and material work together to create an experience that does not just show Bengali heritage but lets visitors feel its weight and warmth. This is a building that does not merely house culture; it participates in it, quietly and with conviction.',
    ],
    sections: [
      {
        items: [
          { id: 'museum-exterior', caption: 'Terracotta exterior', kind: 'render' },
          { id: 'museum-elevations', caption: 'North and south elevations at dusk', kind: 'render' },
          { id: 'museum-lattice', caption: 'Lattice screen and entrance court', kind: 'render' },
          { id: 'museum-concept', caption: 'Concept sketches and site plan', kind: 'drawing' },
          { id: 'museum-plans', caption: 'Ground, first and second floor plans', kind: 'drawing' },
        ],
      },
    ],
  },
  {
    id: 'sanskriti-milon-kendra',
    number: '03',
    title: 'Sanskriti Milon Kendra',
    type: 'Community Centre & Auditorium',
    location: 'Kalyani, West Bengal',
    category: 'Academic work',
    detail: 'monolith',
    model: 'audi',
    skp: { href: 'assets/models/skp/sanskriti-milon-kendra.skp', size: '40.3 MB' },
    hero: 'community-exterior',
    walls: ['community-lobby', 'community-auditorium'],
    summary: 'A solid volume carved open at its edges: a precise auditorium wrapped in a porous public realm.',
    intro: [
      'In a city that gathers to perform, to celebrate, to mourn, and simply to be together, the question this building asked was not how large a stage should be, but how generously a building can give itself to the people around it. The Sanskriti Milon Kendra begins as a single solid volume — heavy, grounded, and certain — and is then opened up strategically, carved away at its edges to create thresholds, courtyards, and passages that draw the public in before they have even bought a ticket.',
      'The auditorium at its core is precise and acoustically resolved, designed for performance at the highest level. But wrapped around it is a porous public realm — community gathering spaces, multipurpose halls, open display areas — that ensures the building is alive even on the days when the stage is dark. Architecture here is not a backdrop for civic life. It is civic life, given form and permanence.',
    ],
    sections: [
      {
        items: [
          { id: 'community-exterior', caption: 'Entrance approach', kind: 'render' },
          { id: 'community-lobby', caption: 'Double-height lobby', kind: 'render' },
          { id: 'community-gallery', caption: 'Upper gallery and lattice light', kind: 'render' },
          { id: 'community-auditorium', caption: 'Auditorium', kind: 'render' },
          { id: 'community-axo', caption: 'Exploded axonometric view', kind: 'drawing' },
          { id: 'community-concept', caption: 'Concept — carved monolith, form development', kind: 'board' },
          { id: 'community-plans-lower', caption: 'Basement and ground floor plans', kind: 'drawing' },
          { id: 'community-plans-upper', caption: 'First floor, auditorium and gallery plans', kind: 'drawing' },
          { id: 'community-section-aa', caption: 'Section AA′', kind: 'drawing' },
          { id: 'community-sections', caption: 'Sections BB′ and CC′', kind: 'drawing' },
        ],
      },
    ],
  },
  {
    id: 'selected-works',
    number: '04',
    title: 'Selected Works',
    type: 'Working Drawings & Interiors',
    location: 'Residence and living area',
    category: 'Academic + intern work',
    detail: 'pair',
    hero: 'works-plan',
    heroSecond: 'interior-living',
    walls: ['works-kitchen', 'interior-moodboard'],
    summary: 'Construction-ready working drawings for a residence, and an interior scheme carried from mood board to finished room.',
    intro: [
      'Two sides of the same practice. A set of working drawings for a residence — ground floor plan, building sections and kitchen details — prepared to construction standard. And an interior scheme for a living area, carried from material palette and furnishing references to the finished room.',
    ],
    sections: [
      {
        title: 'Working Drawings',
        items: [
          { id: 'works-plan', caption: 'Residence — ground floor plan', kind: 'drawing' },
          { id: 'works-sections', caption: 'Residence — building sections', kind: 'drawing' },
          { id: 'works-kitchen', caption: 'Residence — kitchen details', kind: 'drawing' },
        ],
      },
      {
        title: 'Interiors',
        items: [
          { id: 'interior-living', caption: 'Living area', kind: 'render' },
          { id: 'interior-moodboard', caption: 'Living area — materials and furnishing', kind: 'board' },
        ],
      },
    ],
  },
];

export const img = (id) => `assets/img/${id}.jpg`;
export const imgHd = (id) => `assets/img/hd/${id}.jpg`;
export const imgThumb = (id) => `assets/img/thumb/${id}.jpg`;
