import { social } from '../backend/api';
import { useLive } from './hooks';

/**
 * Translations. Keys are the English text, so untranslated strings simply show in English.
 * Language: the person's choice in Settings, otherwise the device language.
 * Product names (Hayve Shop, Pay, Ride…) are brand names and stay as they are.
 */
export type Lang = 'en' | 'es' | 'fr' | 'de' | 'nl';

const D: Record<Exclude<Lang, 'en'>, Record<string, string>> = {
  es: {
    Home: 'Inicio', Search: 'Buscar', More: 'Más', Profile: 'Perfil', Activity: 'Actividad', Messages: 'Mensajes', Notifications: 'Notificaciones', 'For business': 'Para empresas',
    'In the US, Canada, the UK, Ireland and across Europe': 'En EE. UU., Canadá, Reino Unido, Irlanda y toda Europa',
    'One account for everything you need.': 'Una cuenta para todo lo que necesitas.',
    'Shop and sell, pay friends, get a ride, order dinner, rent a car and book a stay. One login, one wallet.': 'Compra y vende, paga a tus amigos, pide un viaje, pide la cena, alquila un coche y reserva alojamiento. Un inicio de sesión, una cartera.',
    'Create your account': 'Crea tu cuenta', 'Sign in': 'Iniciar sesión', 'Everything in Hayve': 'Todo en Hayve', 'Create account': 'Crear cuenta', 'I already have an account': 'Ya tengo una cuenta',
    'Welcome back': 'Bienvenido de nuevo', Email: 'Correo electrónico', Password: 'Contraseña', 'Full name': 'Nombre completo', Country: 'País', Username: 'Nombre de usuario',
    'Your address': 'Tu dirección', 'Use my current location': 'Usar mi ubicación actual', 'Street and number': 'Calle y número', City: 'Ciudad', Personal: 'Personal', Business: 'Empresa',
    'One account for shopping, payments, rides, food, stays and more.': 'Una cuenta para compras, pagos, viajes, comida, alojamiento y más.',
    'Hey {name}': 'Hola {name}', 'Where to, or what do you need?': '¿A dónde vas o qué necesitas?', 'Recent activity': 'Actividad reciente', 'See all': 'Ver todo', 'Offers near you': 'Ofertas cerca de ti', 'Pick up where you left off': 'Sigue donde lo dejaste',
    'Add money': 'Añadir dinero', Send: 'Enviar', Request: 'Pedir', 'Get paid': 'Cobrar', 'Hayve balance': 'Saldo Hayve', History: 'Historial', All: 'Todo', 'Money in': 'Entradas', 'Money out': 'Salidas',
    'Where to?': '¿A dónde?', 'Search destination': 'Buscar destino', Pickup: 'Recogida', 'Finding your driver': 'Buscando conductor', 'Driver on the way': 'Conductor en camino',
    Language: 'Idioma', 'Country and currency': 'País y moneda', Settings: 'Ajustes',
  },
  fr: {
    Home: 'Accueil', Search: 'Rechercher', More: 'Plus', Profile: 'Profil', Activity: 'Activité', Messages: 'Messages', Notifications: 'Notifications', 'For business': 'Pour les entreprises',
    'In the US, Canada, the UK, Ireland and across Europe': 'Aux États-Unis, au Canada, au Royaume-Uni, en Irlande et partout en Europe',
    'One account for everything you need.': 'Un seul compte pour tout ce dont vous avez besoin.',
    'Shop and sell, pay friends, get a ride, order dinner, rent a car and book a stay. One login, one wallet.': 'Achetez et vendez, payez vos amis, commandez une course, faites-vous livrer, louez une voiture et réservez un logement. Une connexion, un portefeuille.',
    'Create your account': 'Créez votre compte', 'Sign in': 'Se connecter', 'Everything in Hayve': 'Tout Hayve', 'Create account': 'Créer un compte', 'I already have an account': "J'ai déjà un compte",
    'Welcome back': 'Bon retour', Email: 'E-mail', Password: 'Mot de passe', 'Full name': 'Nom complet', Country: 'Pays', Username: "Nom d'utilisateur",
    'Your address': 'Votre adresse', 'Use my current location': 'Utiliser ma position', 'Street and number': 'Rue et numéro', City: 'Ville', Personal: 'Personnel', Business: 'Entreprise',
    'One account for shopping, payments, rides, food, stays and more.': 'Un compte pour les achats, les paiements, les courses, les repas, les séjours et plus.',
    'Hey {name}': 'Bonjour {name}', 'Where to, or what do you need?': 'Où allez-vous, ou que vous faut-il ?', 'Recent activity': 'Activité récente', 'See all': 'Tout voir', 'Offers near you': 'Offres près de vous', 'Pick up where you left off': 'Reprenez où vous en étiez',
    'Add money': 'Ajouter de l’argent', Send: 'Envoyer', Request: 'Demander', 'Get paid': 'Encaisser', 'Hayve balance': 'Solde Hayve', History: 'Historique', All: 'Tout', 'Money in': 'Entrées', 'Money out': 'Sorties',
    'Where to?': 'Où allez-vous ?', 'Search destination': 'Rechercher une destination', Pickup: 'Prise en charge', 'Finding your driver': 'Recherche d’un chauffeur', 'Driver on the way': 'Chauffeur en route',
    Language: 'Langue', 'Country and currency': 'Pays et devise', Settings: 'Réglages',
  },
  de: {
    Home: 'Start', Search: 'Suche', More: 'Mehr', Profile: 'Profil', Activity: 'Aktivität', Messages: 'Nachrichten', Notifications: 'Mitteilungen', 'For business': 'Für Unternehmen',
    'In the US, Canada, the UK, Ireland and across Europe': 'In den USA, Kanada, Großbritannien, Irland und ganz Europa',
    'One account for everything you need.': 'Ein Konto für alles, was du brauchst.',
    'Shop and sell, pay friends, get a ride, order dinner, rent a car and book a stay. One login, one wallet.': 'Kaufen und verkaufen, Freunde bezahlen, eine Fahrt buchen, Essen bestellen, ein Auto mieten und eine Unterkunft buchen. Ein Login, eine Wallet.',
    'Create your account': 'Konto erstellen', 'Sign in': 'Anmelden', 'Everything in Hayve': 'Alles in Hayve', 'Create account': 'Konto erstellen', 'I already have an account': 'Ich habe schon ein Konto',
    'Welcome back': 'Willkommen zurück', Email: 'E-Mail', Password: 'Passwort', 'Full name': 'Vollständiger Name', Country: 'Land', Username: 'Benutzername',
    'Your address': 'Deine Adresse', 'Use my current location': 'Meinen Standort verwenden', 'Street and number': 'Straße und Hausnummer', City: 'Stadt', Personal: 'Privat', Business: 'Geschäftlich',
    'One account for shopping, payments, rides, food, stays and more.': 'Ein Konto für Einkäufe, Zahlungen, Fahrten, Essen, Unterkünfte und mehr.',
    'Hey {name}': 'Hallo {name}', 'Where to, or what do you need?': 'Wohin, oder was brauchst du?', 'Recent activity': 'Letzte Aktivität', 'See all': 'Alle anzeigen', 'Offers near you': 'Angebote in deiner Nähe', 'Pick up where you left off': 'Weitermachen, wo du warst',
    'Add money': 'Geld aufladen', Send: 'Senden', Request: 'Anfordern', 'Get paid': 'Bezahlt werden', 'Hayve balance': 'Hayve-Guthaben', History: 'Verlauf', All: 'Alle', 'Money in': 'Eingänge', 'Money out': 'Ausgänge',
    'Where to?': 'Wohin?', 'Search destination': 'Ziel suchen', Pickup: 'Abholung', 'Finding your driver': 'Fahrer wird gesucht', 'Driver on the way': 'Fahrer ist unterwegs',
    Language: 'Sprache', 'Country and currency': 'Land und Währung', Settings: 'Einstellungen',
  },
  nl: {
    Home: 'Home', Search: 'Zoeken', More: 'Meer', Profile: 'Profiel', Activity: 'Activiteit', Messages: 'Berichten', Notifications: 'Meldingen', 'For business': 'Voor bedrijven',
    'In the US, Canada, the UK, Ireland and across Europe': 'In de VS, Canada, het VK, Ierland en heel Europa',
    'One account for everything you need.': 'Eén account voor alles wat je nodig hebt.',
    'Shop and sell, pay friends, get a ride, order dinner, rent a car and book a stay. One login, one wallet.': 'Koop en verkoop, betaal vrienden, bestel een rit of eten, huur een auto en boek een verblijf. Eén login, één wallet.',
    'Create your account': 'Maak je account', 'Sign in': 'Inloggen', 'Everything in Hayve': 'Alles in Hayve', 'Create account': 'Account maken', 'I already have an account': 'Ik heb al een account',
    'Welcome back': 'Welkom terug', Email: 'E-mail', Password: 'Wachtwoord', 'Full name': 'Volledige naam', Country: 'Land', Username: 'Gebruikersnaam',
    'Your address': 'Je adres', 'Use my current location': 'Gebruik mijn locatie', 'Street and number': 'Straat en huisnummer', City: 'Plaats', Personal: 'Persoonlijk', Business: 'Zakelijk',
    'One account for shopping, payments, rides, food, stays and more.': 'Eén account voor winkelen, betalen, ritten, eten, verblijven en meer.',
    'Hey {name}': 'Hoi {name}', 'Where to, or what do you need?': 'Waarheen, of wat heb je nodig?', 'Recent activity': 'Recente activiteit', 'See all': 'Alles', 'Offers near you': 'Aanbiedingen bij jou in de buurt', 'Pick up where you left off': 'Ga verder waar je was',
    'Add money': 'Geld toevoegen', Send: 'Versturen', Request: 'Verzoeken', 'Get paid': 'Betaald worden', 'Hayve balance': 'Hayve-saldo', History: 'Geschiedenis', All: 'Alles', 'Money in': 'Inkomend', 'Money out': 'Uitgaand',
    'Where to?': 'Waarheen?', 'Search destination': 'Bestemming zoeken', Pickup: 'Ophalen', 'Finding your driver': 'Chauffeur zoeken', 'Driver on the way': 'Chauffeur onderweg',
    Language: 'Taal', 'Country and currency': 'Land en valuta', Settings: 'Instellingen',
  },
};

export const LANGUAGES: { key: Lang; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'es', label: 'Español' },
  { key: 'fr', label: 'Français' },
  { key: 'de', label: 'Deutsch' },
  { key: 'nl', label: 'Nederlands' },
];

export function languageFromLocale(locale?: string | null): Lang {
  const l = (locale ?? '').slice(0, 2).toLowerCase();
  return (['es', 'fr', 'de', 'nl'] as const).find((x) => x === l) ?? 'en';
}

const deviceLang = () => languageFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);

export function translate(lang: Lang, text: string, vars?: Record<string, string>) {
  let out = lang === 'en' ? text : (D[lang][text] ?? text);
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
}

/** `const t = useT(); t('Home')` — re-renders when the person changes their language. */
export function useT() {
  const lang =
    useLive(() => {
      try {
        return social.myProfile().profile.language as Lang;
      } catch {
        return deviceLang();
      }
    }).data ?? deviceLang();
  return (text: string, vars?: Record<string, string>) => translate(lang, text, vars);
}
