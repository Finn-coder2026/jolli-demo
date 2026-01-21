import { type Dictionary, insert, t } from "intlayer";

const dateTimeContent = {
	key: "date-time",
	content: {
		// Time formatting - short format (abbreviated)
		justNow: t({ en: "Just now", es: "Justo ahora" }),
		minutesAgo: t({
			en: insert("{{m}} m ago"),
			es: insert("{{m}} m atrás"),
		}),
		hoursAgo: t({
			en: insert("{{h}} h ago"),
			es: insert("{{h}} h atrás"),
		}),
		daysAgo: t({
			en: insert("{{d}} d ago"),
			es: insert("{{d}} d atrás"),
		}),

		// Time formatting - long format (verbose)
		now: t({ en: "now", es: "ahora" }),
		aMinuteAgo: t({ en: "a minute ago", es: "hace un minuto" }),
		aFewMinutesAgo: t({ en: "a few minutes ago", es: "hace unos minutos" }),
		minutesAgoLong: t({
			en: insert("{{m}} minutes ago"),
			es: insert("hace {{m}} minutos"),
		}),
		oneHourAgo: t({ en: "1 hour ago", es: "hace 1 hora" }),
		hoursAgoLong: t({
			en: insert("{{h}} hours ago"),
			es: insert("hace {{h}} horas"),
		}),
		oneDayAgo: t({ en: "1 day ago", es: "hace 1 día" }),
		daysAgoLong: t({
			en: insert("{{d}} days ago"),
			es: insert("hace {{d}} días"),
		}),
		oneWeekAgo: t({ en: "1 week ago", es: "hace 1 semana" }),
		weeksAgo: t({
			en: insert("{{w}} weeks ago"),
			es: insert("hace {{w}} semanas"),
		}),
		oneMonthAgo: t({ en: "1 month ago", es: "hace 1 mes" }),
		monthsAgo: t({
			en: insert("{{m}} months ago"),
			es: insert("hace {{m}} meses"),
		}),
	},
} satisfies Dictionary;

export default dateTimeContent;
