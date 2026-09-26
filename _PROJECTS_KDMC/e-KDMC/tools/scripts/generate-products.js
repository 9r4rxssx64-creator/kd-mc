const fs = require('fs');
const path = require('path');

const STORES = {
  "digital-vault": {
    name: "Digital Vault",
    theme: {primary:"#D4AF37",bg:"#0a0a0a",card:"#1a1a1a",text:"#f0f0f0"},
    cats: [
      {id:"templates-notion",name:"Templates Notion",icon:"📋",count:12},
      {id:"templates-canva",name:"Templates Canva",icon:"🎨",count:12},
      {id:"templates-excel",name:"Templates Excel",icon:"📊",count:10},
      {id:"presets-photo",name:"Presets Photo",icon:"📸",count:10},
      {id:"ebooks",name:"E-books & Guides",icon:"📚",count:15},
      {id:"formations",name:"Formations Vidéo",icon:"🎓",count:12},
      {id:"design",name:"Design Assets",icon:"✏️",count:10},
      {id:"business",name:"Business & Marketing",icon:"💼",count:10},
      {id:"dev",name:"Dev & Tech",icon:"💻",count:9}
    ],
    productGen: function(cat, i) {
      const names = {
        "templates-notion":["Productivité Pro","Organisation Vie","Gestion Projet","Budget Personnel","Habitudes Tracker","Journal Quotidien","CRM Freelance","Planning Repas","Objectifs Annuels","Bibliothèque Perso","Dashboard Étudiant","Suivi Fitness"],
        "templates-canva":["Pack Instagram Stories","Posts LinkedIn Pro","Bannières YouTube","Kit Branding Complet","Flyers Événement","Cartes de Visite","Présentations Pro","Menu Restaurant","CV Moderne","Newsletter Design","Infographies Pack","Stories Highlight"],
        "templates-excel":["Dashboard Financier","Suivi Stock Inventaire","Planning Employés","Budget Familial","Facturation Auto","Analyse Ventes","Gestion Contacts","Tableau de Bord KPI","Calculateur Prêt","Suivi Calories"],
        "presets-photo":["Film Vintage Pack","Portrait Studio","Paysage Doré","Noir & Blanc Cinéma","Pastel Doux","Urbain Street","Food Photography","Mariage Élégant","Automne Chaleureux","Néon Night"],
        "ebooks":["Productivité 10x","Marketing Digital","Investir Simplement","Freelance Réussite","Mindfulness Guide","Nutrition Optimale","Écriture Créative","Photo pour Débutants","Leadership Moderne","Gestion du Temps","Minimalisme Digital","Yoga au Quotidien","Finance Personnelle","Développement Web","Méditation Guidée"],
        "formations":["Masterclass Photoshop","Excel Avancé","Python pour Débutants","Marketing Instagram","Design UI/UX","Montage Vidéo Pro","WordPress Complet","SEO Masterclass","Copywriting Expert","Illustration Digitale","React.js Moderne","Crypto & Blockchain"],
        "design":["Pack 500 Icônes SVG","Mockups iPhone 16","Textures Papier HD","Illustrations Flat","Fonts Bundle Premium","Patterns Géométriques","Mockups Packaging","Backgrounds Abstract","UI Kit Dashboard","Logo Templates"],
        "business":["Plan Business Canvas","Pitch Deck Template","Social Media Calendar","Email Sequences Pack","Landing Page Kit","Sales Funnel Blueprint","Brand Guidelines","Invoice Template Pro","Contract Templates","Growth Hacking Guide"],
        "dev":["Boilerplate SaaS","Dashboard Admin React","API Starter Kit","Landing Page HTML","Portfolio Template","E-commerce Starter","Blog Engine Node.js","Auth System JWT","Chrome Extension Kit"]
      };
      const n = names[cat.id] ? names[cat.id][i] : "Produit "+i;
      const basePrice = cat.id==="formations"?29.99+Math.random()*100:9.99+Math.random()*35;
      const price = Math.round(basePrice*100)/100;
      const origPrice = Math.round(price*(1.4+Math.random()*0.6)*100)/100;
      const formats = {
        "templates-notion":"Notion Template","templates-canva":"Canva Template","templates-excel":"Excel/Sheets",
        "presets-photo":"Lightroom/Capture One","ebooks":"PDF + EPUB","formations":"Vidéo HD + Ressources",
        "design":"SVG/PNG/AI","business":"PDF + Canva + Notion","dev":"Code source + Docs"
      };
      return {
        id: cat.id.replace(/-/g,"").slice(0,2)+String(i+1).padStart(3,"0"),
        name: n,
        cat: cat.id,
        price: price,
        origPrice: origPrice,
        img: cat.icon,
        rating: Math.round((4+Math.random())*10)/10,
        reviews: Math.floor(20+Math.random()*300),
        desc: "Découvrez "+n+" — un outil professionnel conçu pour booster votre productivité. Testé et approuvé par des milliers d'utilisateurs satisfaits.",
        features: ["Accès à vie après achat","Mises à jour gratuites incluses","Compatible tous appareils","Support par email 24/7"],
        tags: [cat.name.toLowerCase(), "digital", "professionnel"],
        digital: true,
        downloadSize: Math.floor(2+Math.random()*50)+" MB",
        format: formats[cat.id]||"Digital"
      };
    }
  },
  "tech-hub": {
    name: "Tech Hub",
    theme: {primary:"#3b82f6",bg:"#0f172a",card:"#1e293b",text:"#f1f5f9"},
    cats: [
      {id:"smartphones",name:"Smartphones & Accessoires",icon:"📱",count:14},
      {id:"audio",name:"Audio",icon:"🎧",count:12},
      {id:"chargeurs",name:"Chargeurs & Câbles",icon:"🔌",count:12},
      {id:"bureau",name:"Bureau & Desk",icon:"🖥️",count:14},
      {id:"smart-home",name:"Maison Connectée",icon:"🏠",count:12},
      {id:"gaming",name:"Gaming",icon:"🎮",count:12},
      {id:"photo-video",name:"Photo & Vidéo",icon:"📷",count:12},
      {id:"wearables",name:"Wearables",icon:"⌚",count:12}
    ],
    productGen: function(cat, i) {
      const names = {
        "smartphones":["Coque MagSafe Premium","Protection Écran 9H","Support Voiture Magnétique","Bague Anneau Support","Objectif Macro Clip","Grip PopSocket Luxe","Étui Portefeuille Cuir","Protection Caméra","Stand Bureau Ajustable","Stylet Tactile Pro","Coque Transparente Ultra","Adaptateur Double SIM","Lanière Crossbody","Film Hydrogel Mat"],
        "audio":["Écouteurs Bluetooth 5.3","Casque ANC Premium","Enceinte Portable 20W","Écouteurs Sport Waterproof","Micro Cravate Sans Fil","Casque Gaming RGB","Enceinte Douche Étanche","DAC USB-C HiFi","Support Casque Bois","Câble Audio Tressé","Écouteurs Open-Ear","Enceinte Vintage Rétro"],
        "chargeurs":["Chargeur Sans Fil 15W","Câble USB-C Tressé 2m","Batterie Externe 20000mAh","Chargeur Voiture 65W","Station 3-en-1 MagSafe","Câble Lightning Certifié","Chargeur Mural GaN 65W","Hub USB-C 7-en-1","Câble Magnétique Rotatif","Batterie Solaire Outdoor","Dock Charge Multiple","Rallonge USB-C 3m"],
        "bureau":["Lampe LED Écran Monitor","Support Laptop Aluminium","Tapis Bureau XXL","Organiseur Câbles","Webcam 4K Autofocus","Repose-Poignet Ergonomique","Support Double Écran","Lampe Bureau LED Touch","Hub Thunderbolt 4","Sous-Main Cuir","Porte-Casque RGB","Ventilateur USB Silencieux","Range-Câbles Magnétique","Rehausseur Écran Bois"],
        "smart-home":["Ampoule RGB Connectée","Prise Connectée WiFi","Caméra Sécurité 2K","Thermostat Intelligent","Détecteur Mouvement","Sonnette Vidéo WiFi","Capteur Température","Serrure Connectée","Diffuseur Huiles WiFi","Led Strip RGB 5m","Interrupteur Tactile","Hub Zigbee Central"],
        "gaming":["Souris Gaming 25000 DPI","Clavier Mécanique RGB","Tapis XXL RGB","Manette Pro Bluetooth","Webcam Streaming 1080p","Support Manette Charge","Lunettes Anti-Lumière","Capture Card USB","Casque 7.1 Surround","Ventilateur Laptop Gaming","Clé USB 256Go Rapide","Hub Manette 4 Ports"],
        "photo-video":["Trépied Flexible Gorilla","Ring Light 10 pouces","Stabilisateur Smartphone","Filtre ND Variable","Micro Shotgun Compact","Sac Photo Étanche","Mini Trépied Alu","Lumière LED Panneau","Télécommande Bluetooth","Diffuseur Flash Soft","Support Fond Vert","Carte SD 256Go V30"],
        "wearables":["Bracelet Fitness Tracker","Montre Sport GPS","Lunettes Audio Bluetooth","Bague Connectée Santé","Tracker Sommeil","Podomètre Ceinture","Montre Hybride Élégante","Bracelet UV Solaire","Clip Fitness Discret","Ceinture Cardio ANT+","Brassard Sport Running","Montre Plongée 50m"]
      };
      const n = names[cat.id]?names[cat.id][i]:"Gadget Tech "+i;
      const basePrice = 9.99+Math.random()*70;
      const price = Math.round(basePrice*100)/100;
      const origPrice = Math.round(price*(1.3+Math.random()*0.5)*100)/100;
      return {
        id: "th"+String(i+1).padStart(3,"0"),
        name: n, cat: cat.id, price, origPrice, img: cat.icon,
        rating: Math.round((3.8+Math.random()*1.2)*10)/10,
        reviews: Math.floor(10+Math.random()*500),
        desc: n+" — qualité premium, livraison rapide. Garantie 2 ans. Compatible avec tous vos appareils.",
        specs: {Poids:Math.floor(50+Math.random()*400)+"g",Garantie:"2 ans",Livraison:"5-12 jours"},
        brand: ["TechPro","NovaTech","ZenGear","PulseTech","CoreTech"][Math.floor(Math.random()*5)],
        stock: Math.floor(3+Math.random()*50),
        tags: [cat.name.toLowerCase(),"tech","gadget"],
        shipping: "standard"
      };
    }
  },
  "glow-wellness": {
    name: "Glow Wellness",
    theme: {primary:"#b76e79",bg:"#faf5ef",card:"#ffffff",text:"#2d2d2d"},
    cats: [
      {id:"visage",name:"Soins Visage",icon:"✨",count:16},
      {id:"corps",name:"Soins Corps",icon:"🧴",count:14},
      {id:"aromatherapie",name:"Aromathérapie",icon:"🕯️",count:12},
      {id:"bien-etre",name:"Bien-être",icon:"🧘",count:12},
      {id:"cheveux",name:"Cheveux Naturels",icon:"💇",count:12},
      {id:"maquillage",name:"Maquillage Naturel",icon:"💄",count:12},
      {id:"coffrets",name:"Coffrets Cadeaux",icon:"🎁",count:12},
      {id:"accessoires",name:"Accessoires Spa",icon:"🛁",count:10}
    ],
    productGen: function(cat, i) {
      const names = {
        "visage":["Sérum Vitamine C Bio","Crème Hydratante Aloe","Nettoyant Mousse Douce","Masque Argile Verte","Huile Rosier Musquée","Contour Yeux Peptides","Exfoliant Enzymatique","Brume Hydratante Rose","Tonique Acide Hyaluronique","Sérum Rétinol Nuit","Crème Solaire SPF50","Masque Tissu Collagène","Gel Apaisant Camomille","Baume Lèvres Karité","Sérum Niacinamide 10%","Huile Jojoba Pure"],
        "corps":["Huile Corporelle Argan","Gommage Sucre Coco","Lait Corps Amande","Beurre Karité Fouetté","Crème Mains Lavande","Gel Douche Miel","Huile Sèche Multi-Usage","Baume Réparateur","Lait Après-Soleil","Crème Anti-Vergetures","Gommage Café Tonifiant","Savon Surgras Avoine","Déodorant Naturel Pierre","Huile Massage Relaxante"],
        "aromatherapie":["Huile Essentielle Lavande","Diffuseur Ultrasonique Bois","Bougie Soja Vanille","Roll-On Relaxation","Encens Naturel Santal","Spray Oreiller Sommeil","Set 12 Huiles Essentielles","Bougie Massage Tiède","Sachets Lavande Provence","Diffuseur Voiture","Brume Méditation","Bougie 3 Mèches Luxe"],
        "bien-etre":["Tisane Détox Bio","Complément Magnésium","Tapis Yoga Liège","Balle Massage Fascia","Coussin Méditation","Rouleau Jade Visage","Gua Sha Quartz Rose","Set Ventouses Silicone","Bouillotte Graines Lin","Bande Élastique Set","Diffuseur Personnel","Carnet Gratitude"],
        "cheveux":["Shampoing Solide Ortie","Masque Avocat Réparateur","Huile Ricin Fortifiante","Après-Shampoing Coco","Sérum Pointes Argan","Brosse Démêlante Bois","Peigne Corne Naturel","Spray Sel Texturisant","Masque Protéiné Kératine","Shampoing Sec Naturel","Huile Amla Indienne","Élastiques Soie Set"],
        "maquillage":["Fond de Teint Minéral","Rouge à Lèvres Naturel","Mascara Bio Volume","Blush Crème Pêche","Poudre Fixante Riz","Crayon Sourcils Naturel","Baume Teinté SPF15","Enlumineur Doré Bio","Palette Nude Naturelle","Eye-Liner Feutre Bio","Poudre Bronzante Coco","Gloss Lèvres Cerise"],
        "coffrets":["Coffret Découverte Visage","Set Spa Maison Complet","Coffret Huiles Essentielles","Kit Routine Anti-Âge","Set Méditation Zen","Coffret Bain Relaxant","Kit Beauté Voyage","Coffret Maman Chérie","Set Detox Complet","Coffret Saint-Valentin","Kit Homme Barbe","Box Mensuelle Surprise"],
        "accessoires":["Brosse Visage Silicone","Bandeau Spa Éponge","Gant Exfoliant Soie","Bol Masque Bambou","Spatule Application Set","Miroir Grossissant LED","Pochette Coton Bio","Éponge Konjac Charbon","Pinceau Masque Silicone","Trousse Toilette Lin"]
      };
      const n = names[cat.id]?names[cat.id][i]:"Soin Naturel "+i;
      const basePrice = 9.99+Math.random()*45;
      const price = Math.round(basePrice*100)/100;
      const origPrice = Math.round(price*(1.2+Math.random()*0.5)*100)/100;
      return {
        id: "gw"+String(i+1).padStart(3,"0"),
        name: n, cat: cat.id, price, origPrice, img: cat.icon,
        rating: Math.round((4.2+Math.random()*0.8)*10)/10,
        reviews: Math.floor(15+Math.random()*250),
        desc: n+" — formulé avec des ingrédients 100% naturels et biologiques. Sans parabènes, sans sulfates, sans cruauté animale.",
        ingredients: ["Aloe Vera Bio","Huile de Jojoba","Vitamine E","Beurre de Karité"],
        benefits: ["Hydratation intense","Peau éclatante","Résultats visibles en 2 semaines"],
        vegan: Math.random()>0.2, crueltyfree: true, organic: Math.random()>0.3,
        tags: [cat.name.toLowerCase(),"naturel","bio"],
        weight: Math.floor(30+Math.random()*200)+"ml"
      };
    }
  },
  "pawsome": {
    name: "Pawsome",
    theme: {primary:"#f97316",bg:"#fffbf5",card:"#ffffff",text:"#1c1917"},
    cats: [
      {id:"colliers",name:"Colliers & Laisses",icon:"🐕",count:14},
      {id:"jouets",name:"Jouets",icon:"🎾",count:14},
      {id:"couchage",name:"Couchage & Confort",icon:"🛏️",count:12},
      {id:"alimentation",name:"Alimentation & Friandises",icon:"🦴",count:12},
      {id:"toilettage",name:"Toilettage",icon:"🚿",count:12},
      {id:"chat",name:"Univers Chat",icon:"🐱",count:12},
      {id:"accessoires-pet",name:"Accessoires",icon:"🐾",count:12},
      {id:"personnalise",name:"Personnalisé",icon:"✨",count:12}
    ],
    productGen: function(cat, i) {
      const names = {
        "colliers":["Collier Cuir Tressé","Laisse Rétractable 5m","Harnais Anti-Traction","Collier LED Lumineux","Laisse Mains Libres","Médaille Gravée Acier","Harnais Chiot Doux","Collier GPS Tracker","Bandana Personnalisé","Laisse Double Chiens","Collier Anti-Parasites","Harnais Voiture Sécurité","Noeud Papillon Chien","Collier Réfléchissant"],
        "jouets":["Balle Indestructible","Corde Tressée XXL","Frisbee Caoutchouc","Kong Classic Large","Jouet Couineur Peluche","Balle Lance Automatique","Puzzle Friandises","Jouet Dentaire Nylon","Peluche Canard","Bâton à Mâcher","Tunnel Agility","Jouet Flottant Piscine","Set 10 Balles Tennis","Distributeur Treats"],
        "couchage":["Lit Orthopédique Mousse","Coussin Déhoussable XL","Panier Osier Naturel","Couverture Polaire Douce","Matelas Rafraîchissant","Niche Intérieure Bois","Lit Surélevé Camping","Couverture Voyage Pliable","Panier Cosy Cave","Tapis Antidérapant","Lit Chauffant Hiver","Hamac Fenêtre Chat"],
        "alimentation":["Gamelle Anti-Glouton","Fontaine à Eau 2L","Distributeur Croquettes Auto","Set Gamelles Inox","Tapis Léchage Silicone","Friandises Naturelles Bio","Boîte Conservation Croquettes","Gamelle Voyage Pliable","Os à Mâcher Naturel","Complément Articulations","Friandises Dentaires","Gamelle Surélevée Double"],
        "toilettage":["Brosse Démêlante Pro","Shampoing Naturel Avoine","Coupe-Griffes LED","Gant Massage Toilettage","Spray Démêlant Brillance","Brosse à Dents Kit","Serviette Microfibre XXL","Tondeuse Silencieuse","Lingettes Nettoyantes Bio","Parfum Naturel Chien","Nettoyant Oreilles Doux","Baume Coussinets"],
        "chat":["Arbre à Chat 150cm","Griffoir Carton Design","Jouet Plumes Automatique","Litière Auto-Nettoyante","Fontaine Chat Céramique","Tunnel Crinkle 3 Voies","Sac Transport Hublot","Hamac Radiateur","Herbe à Chat Bio","Balle Interactive LED","Niche Murale Design","Collier Chat GPS"],
        "accessoires-pet":["Sac Transport Avion","Poussette Chien Pliable","Rampe Voiture Pliable","Gilet de Sauvetage","Manteau Imperméable","Bottines Protection Sol","Ceinture Sécurité Auto","Porte Gamelle Voyage","GPS Tracker Mini","Caméra Surveillance Pet","Sac à Dos Porteur","Clicker Training Set"],
        "personnalise":["Portrait Pop Art Custom","Médaille Gravée Or","Coussin Photo Personnalisé","Bol Gravé Prénom","Calendrier Photo Pet","Mug Portrait Animal","Collier Brodé Prénom","Cadre Photo Empreinte","Plaque Porte Personnalisée","T-Shirt Propriétaire","Couverture Brodée","Poster Illustré Custom"]
      };
      const n = names[cat.id]?names[cat.id][i]:"Accessoire Animal "+i;
      const basePrice = 9.99+Math.random()*45;
      const price = Math.round(basePrice*100)/100;
      const origPrice = Math.round(price*(1.25+Math.random()*0.5)*100)/100;
      return {
        id: "pw"+String(i+1).padStart(3,"0"),
        name: n, cat: cat.id, price, origPrice, img: cat.icon,
        rating: Math.round((4+Math.random()*1)*10)/10,
        reviews: Math.floor(10+Math.random()*350),
        desc: n+" — conçu pour le bonheur et la sécurité de votre compagnon. Matériaux non-toxiques, qualité premium.",
        tags: [cat.name.toLowerCase(),"animaux","premium"],
        stock: Math.floor(5+Math.random()*40),
        shipping: "standard"
      };
    }
  },
  "ecocraft": {
    name: "EcoCraft",
    theme: {primary:"#166534",bg:"#f9faf8",card:"#ffffff",text:"#1a2e1a"},
    cats: [
      {id:"cuisine",name:"Cuisine Zéro Déchet",icon:"🍃",count:14},
      {id:"salle-bain",name:"Salle de Bain Éco",icon:"🌿",count:12},
      {id:"maison",name:"Maison Durable",icon:"🏡",count:12},
      {id:"textile",name:"Textile Bio",icon:"🧶",count:12},
      {id:"jardin",name:"Jardin & Extérieur",icon:"🌱",count:10},
      {id:"mobilite",name:"Mobilité Verte",icon:"🚲",count:10},
      {id:"bureau-eco",name:"Bureau Responsable",icon:"📎",count:10},
      {id:"coffrets-eco",name:"Coffrets Découverte",icon:"🎁",count:10},
      {id:"solaire",name:"Solaire & Énergie",icon:"☀️",count:10}
    ],
    productGen: function(cat, i) {
      const names = {
        "cuisine":["Bee Wraps Set 3","Gourde Inox 750ml","Paille Bambou x10","Sac Vrac Coton Bio","Lunch Box Inox","Brosse Vaisselle Bois","Éponge Lavable x5","Film Alimentaire Réutilisable","Sachet Silicone 4 tailles","Composteur Cuisine","Bouteille Infuseur Verre","Couverts Bambou Voyage","Filtre Café Réutilisable","Moule Silicone Platine"],
        "salle-bain":["Shampoing Solide Bio","Brosse à Dents Bambou x4","Savon Surgras Artisanal","Oriculi Bambou","Lingettes Démaquillantes x7","Déodorant Solide Naturel","Cup Menstruelle Bio","Coton-Tige Réutilisable","Rasoir Sûreté Inox","Porte-Savon Bois","Dentifrice Solide","Peigne Bois Naturel"],
        "maison":["Bougies Cire Soja Set","Lessive Écologique 2L","Sacs Poubelle Compostables","Éponge Luffa Naturelle","Spray Multi-Usage Bio","Pastilles Lave-Vaisselle","Diffuseur Bambou","Torchon Lin Naturel x3","Panier Rangement Jute","Cintres Bois Massif x10","Lessive en Feuilles","Adoucissant Naturel"],
        "textile":["Tote Bag Coton Bio","T-Shirt Chanvre Unisex","Chaussettes Bambou x5","Serviette Plage Bio","Tablier Cuisine Lin","Trousse Toilette Liège","Pochon Coton Bio x3","Foulard Soie Naturelle","Bonnet Laine Recyclée","Sac à Dos Chanvre","Coussin Lin Naturel","Nappe Coton Bio"],
        "jardin":["Kit Graines Aromatiques","Composteur Rotatif","Arrosoir Cuivre 2L","Sécateur Inox Pro","Pots Biodégradables x20","Gants Jardinage Cuir","Hôtel à Insectes Bois","Nichoir Oiseaux Artisanal","Graines Fleurs Mellifères","Kit Germination"],
        "mobilite":["Sac Vélo Imperméable","Gourde Sport Inox","Lumière Vélo Dynamo","Panier Vélo Osier","Poncho Pluie Recyclé","Sacoche Guidon Liège","Antivol Acier Tressé","Klaxon Bambou","Réflecteurs Bois Set","Kit Réparation Vélo"],
        "bureau-eco":["Cahier Papier Recyclé","Stylos Bambou Set","Pot Crayons Bois","Agenda Liège","Trombones Bois x50","Post-it Réutilisables","Règle Bambou 30cm","Tapis Souris Liège","Organiseur Bureau Bambou","Lampe Solaire USB"],
        "coffrets-eco":["Box Zéro Déchet Débutant","Coffret Salle de Bain","Kit Cuisine Durable","Set Pique-Nique Éco","Coffret Noël Naturel","Box Jardinage Urbain","Kit Bureau Vert","Coffret Bien-être Bio","Set Voyage Minimaliste","Box Famille Éco"],
        "solaire":["Chargeur Solaire 20W","Lanterne Solaire Camping","Guirlande Solaire 10m","Lampe Solaire Jardin x4","Batterie Solaire 10000mAh","Douche Solaire Camping","Four Solaire Portable","Radio Solaire Manivelle","Ventilateur Solaire USB","Horloge Solaire Bois"]
      };
      const n = names[cat.id]?names[cat.id][i]:"Produit Éco "+i;
      const basePrice = 7.99+Math.random()*40;
      const price = Math.round(basePrice*100)/100;
      const origPrice = Math.round(price*(1.2+Math.random()*0.4)*100)/100;
      return {
        id: "ec"+String(i+1).padStart(3,"0"),
        name: n, cat: cat.id, price, origPrice, img: cat.icon,
        rating: Math.round((4.1+Math.random()*0.9)*10)/10,
        reviews: Math.floor(8+Math.random()*200),
        desc: n+" — fabriqué de manière responsable avec des matériaux durables. Zéro plastique, impact positif garanti.",
        ecoScore: Math.floor(7+Math.random()*3)+"/10",
        material: ["Bambou","Coton Bio","Inox","Liège","Lin","Bois FSC"][Math.floor(Math.random()*6)],
        tags: [cat.name.toLowerCase(),"écologique","zéro déchet"],
        stock: Math.floor(5+Math.random()*30),
        shipping: "standard"
      };
    }
  }
};

// Génère les catalogues
Object.keys(STORES).forEach(slug => {
  const store = STORES[slug];
  const products = [];
  let globalIdx = 0;
  store.cats.forEach(cat => {
    for(let i = 0; i < cat.count; i++) {
      products.push(store.productGen(cat, i));
      globalIdx++;
    }
  });
  const outDir = path.join(__dirname, '../../stores', slug);
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(path.join(outDir, 'products.json'), JSON.stringify({
    store: slug,
    name: store.name,
    theme: store.theme,
    categories: store.cats.map(c => ({id: c.id, name: c.name, icon: c.icon})),
    products: products
  }, null, 0));
  console.log(`✅ ${store.name}: ${products.length} produits → stores/${slug}/products.json`);
});
