"""World of Warcraft lore knowledge base for RAG retrieval.

50+ entries covering races, locations, characters, events, and Teldrassil-specific lore.
Each entry has topic, category, and content fields for retrieval.
"""

from __future__ import annotations

KNOWLEDGE_BASE: list[dict] = [
    # ═══════════════════════════════════════════════════════════════
    # RACES & FACTIONS
    # ═══════════════════════════════════════════════════════════════
    {
        "topic": "Night Elves (Kaldorei)",
        "category": "races",
        "content": (
            "The Kaldorei, or Night Elves, are among the oldest mortal races on Azeroth. "
            "Once immortal, they lost their eternal life when Nordrassil was damaged during "
            "the Third War. They are deeply connected to nature and worship the moon goddess "
            "Elune. Their society is matriarchal, with women serving as warriors (Sentinels) "
            "and priestesses while men traditionally became druids. They have purple or blue "
            "skin, long pointed ears, and glowing silver or amber eyes. They are masters of "
            "stealth, archery, and druidic magic."
        ),
    },
    {
        "topic": "Humans of Stormwind",
        "category": "races",
        "content": (
            "Humans are the most numerous race in the Alliance. The Kingdom of Stormwind, "
            "rebuilt after the First War, is their greatest city. Humans are adaptable, "
            "resourceful, and skilled in both martial and arcane arts. King Varian Wrynn "
            "led them through many conflicts before his son Anduin took the throne. Humans "
            "are shorter-lived than most races but make up for it with determination."
        ),
    },
    {
        "topic": "Orcs of the Horde",
        "category": "races",
        "content": (
            "The Orcs originally came from the world of Draenor. Corrupted by the Burning "
            "Legion's fel magic, they invaded Azeroth through the Dark Portal. After being "
            "freed from demonic influence by Thrall, they founded Orgrimmar in Durotar. "
            "Orcs value honor, strength, and shamanic traditions. They are fierce warriors "
            "who follow a code of honor in battle."
        ),
    },
    {
        "topic": "Forsaken (Undead)",
        "category": "races",
        "content": (
            "The Forsaken are undead humans who broke free from the Lich King's control. "
            "Led by Sylvanas Windrunner, the Banshee Queen, they made their home in the "
            "Undercity beneath the ruins of Lordaeron. They are mistrusted by most races "
            "but allied with the Horde. The Forsaken seek a cure for their undeath while "
            "developing dark alchemy and plague sciences."
        ),
    },
    {
        "topic": "Tauren",
        "category": "races",
        "content": (
            "The Tauren are massive, bovine humanoids who live on the plains of Mulgore. "
            "They are peaceful, spiritual, and deeply connected to the Earth Mother. Their "
            "capital Thunder Bluff sits atop great mesas. Led by Cairne Bloodhoof and later "
            "his son Baine, they joined the Horde out of gratitude to Thrall. Tauren are "
            "skilled druids, shamans, and warriors."
        ),
    },
    {
        "topic": "Dwarves of Ironforge",
        "category": "races",
        "content": (
            "The Dwarves of Ironforge are a stout, hardy people who live inside mountains. "
            "They are renowned miners, smiths, and engineers. Their love of ale, stories, "
            "and combat is legendary. The three Dwarf clans — Bronzebeard, Wildhammer, and "
            "Dark Iron — have a complex history of rivalry and eventual reunification."
        ),
    },
    {
        "topic": "Trolls (Darkspear)",
        "category": "races",
        "content": (
            "The Darkspear Trolls are a tribe of jungle trolls allied with the Horde. "
            "They practice voodoo magic, worship the Loa spirits, and are skilled hunters "
            "and shadow priests. Vol'jin led them with wisdom until his death, when he "
            "named Sylvanas Warchief. Trolls are one of the oldest races on Azeroth, "
            "predating even the Night Elves."
        ),
    },
    {
        "topic": "Blood Elves (Sin'dorei)",
        "category": "races",
        "content": (
            "The Blood Elves, or Sin'dorei, are high elves who renamed themselves after "
            "the Scourge destroyed their homeland of Quel'Thalas and the Sunwell. Addicted "
            "to arcane magic, they joined the Horde under Prince Kael'thas. Their capital "
            "Silvermoon is a beautiful city of spires and arcane energy. They eventually "
            "restored the Sunwell with the help of the naaru."
        ),
    },
    {
        "topic": "Gnomes",
        "category": "races",
        "content": (
            "Gnomes are tiny, brilliant inventors who once lived in Gnomeregan, a vast "
            "underground city. When it was irradiated by their own defense systems during "
            "a trogg invasion, they fled to Ironforge. Gnomes are obsessed with technology, "
            "engineering, and discovery. Despite their small size, they are fierce allies."
        ),
    },
    {
        "topic": "Draenei",
        "category": "races",
        "content": (
            "The Draenei are an ancient race who fled their homeworld to escape the "
            "Burning Legion. Their dimensional ship, the Exodar, crash-landed on Azeroth. "
            "They are deeply devout followers of the Holy Light, led by the Prophet Velen. "
            "Draenei are tall, blue-skinned, with horns and hooves. They are skilled healers "
            "and paladins."
        ),
    },
    # ═══════════════════════════════════════════════════════════════
    # LOCATIONS
    # ═══════════════════════════════════════════════════════════════
    {
        "topic": "Teldrassil",
        "category": "locations",
        "content": (
            "Teldrassil was a massive World Tree grown by the Night Elves after the Third "
            "War, planted by Archdruid Fandral Staghelm in an attempt to restore the Night "
            "Elves' immortality. Unlike its predecessor Nordrassil, Teldrassil was never "
            "blessed by the Dragon Aspects, and became corrupted by the Emerald Nightmare. "
            "The tree stood off the coast of northern Kalimdor, so vast that an entire "
            "forest ecosystem existed on its canopy. It was tragically burned by Sylvanas "
            "Windrunner during the War of Thorns, killing thousands of Night Elves."
        ),
    },
    {
        "topic": "Darnassus",
        "category": "locations",
        "content": (
            "Darnassus was the capital city of the Night Elves, built atop the World Tree "
            "Teldrassil. It featured the Temple of the Moon where Tyrande led worship of "
            "Elune, beautiful moonwells, and ancient trees. The city was serene and mystical, "
            "bathed in eternal twilight. It was destroyed when Sylvanas burned Teldrassil."
        ),
    },
    {
        "topic": "Stormwind City",
        "category": "locations",
        "content": (
            "Stormwind is the capital of the Human kingdom and the main Alliance hub. "
            "Rebuilt after the First War, it features the grand Stormwind Keep, the "
            "Cathedral of Light, the Mage Quarter, and the bustling Trade District. "
            "It is one of the most populated cities on Azeroth."
        ),
    },
    {
        "topic": "Orgrimmar",
        "category": "locations",
        "content": (
            "Orgrimmar is the Orc capital city in Durotar, named after Orgrim Doomhammer. "
            "It is a fortress city of red stone and iron, built into the harsh desert "
            "landscape. The Valley of Strength houses the Warchief's throne, and the city "
            "is the primary Horde hub."
        ),
    },
    {
        "topic": "Ashenvale",
        "category": "locations",
        "content": (
            "Ashenvale is a lush ancient forest in northern Kalimdor, sacred to the Night "
            "Elves. It has been a site of constant conflict between the Alliance and Horde, "
            "with the Warsong Outriders logging its ancient trees for lumber. The forest is "
            "home to many ancient creatures, moonwells, and Night Elf outposts."
        ),
    },
    {
        "topic": "Darkshore",
        "category": "locations",
        "content": (
            "Darkshore is a long, narrow coastal zone in northern Kalimdor. Once a peaceful "
            "Night Elf territory, it was devastated by the Cataclysm and later by the Horde "
            "invasion during the War of Thorns. Ancient ruins, corrupted wildlife, and "
            "ghostly shipwrecks dot its beaches."
        ),
    },
    {
        "topic": "Moonglade",
        "category": "locations",
        "content": (
            "Moonglade is a sacred druid sanctuary in northern Kalimdor. It is neutral "
            "territory where druids of all races gather. The village of Nighthaven sits "
            "beside Lake Elune'ara. It is the site of the Lunar Festival and hosts the "
            "Cenarion Circle's leadership."
        ),
    },
    {
        "topic": "The Emerald Dream",
        "category": "locations",
        "content": (
            "The Emerald Dream is a parallel dimension of pure, uncorrupted nature — a "
            "mirror of Azeroth as it was meant to be. Druids enter the Dream to commune "
            "with nature and maintain the balance of the natural world. The Dream was "
            "corrupted by the Emerald Nightmare, a manifestation of the Old Gods' power, "
            "which trapped many druids in eternal sleep."
        ),
    },
    {
        "topic": "Mount Hyjal",
        "category": "locations",
        "content": (
            "Mount Hyjal is a sacred mountain in northern Kalimdor where the original "
            "World Tree Nordrassil grows. It was the site of the climactic Battle of Mount "
            "Hyjal where Archimonde was defeated. The mountain is protected by the Guardians "
            "of Hyjal and is a nexus of druidic power."
        ),
    },
    # ═══════════════════════════════════════════════════════════════
    # KEY CHARACTERS
    # ═══════════════════════════════════════════════════════════════
    {
        "topic": "Tyrande Whisperwind",
        "category": "characters",
        "content": (
            "Tyrande Whisperwind is the High Priestess of Elune and co-leader of the Night "
            "Elves alongside her husband Malfurion Stormrage. She has led her people for "
            "over ten thousand years. A fierce warrior and devout priestess, she channels "
            "the power of the moon goddess in battle. After the Burning of Teldrassil, she "
            "became the Night Warrior, an avatar of Elune's wrath."
        ),
    },
    {
        "topic": "Malfurion Stormrage",
        "category": "characters",
        "content": (
            "Malfurion Stormrage is the first mortal druid, trained by the demigod Cenarius "
            "himself. He is the twin brother of Illidan and husband of Tyrande. Malfurion "
            "played a key role in the War of the Ancients, the Battle of Mount Hyjal, and "
            "the defeat of the Emerald Nightmare. He spent millennia sleeping in the Emerald "
            "Dream before awakening to lead his people."
        ),
    },
    {
        "topic": "Illidan Stormrage",
        "category": "characters",
        "content": (
            "Illidan Stormrage, the Betrayer, is Malfurion's twin brother. Obsessed with "
            "arcane power and his unrequited love for Tyrande, Illidan consumed the power "
            "of the Skull of Gul'dan, becoming a demon hunter — half Night Elf, half demon. "
            "He was imprisoned for ten thousand years for creating a second Well of Eternity. "
            "Despite his methods, Illidan ultimately fought against the Burning Legion."
        ),
    },
    {
        "topic": "Sylvanas Windrunner",
        "category": "characters",
        "content": (
            "Sylvanas Windrunner was once the Ranger-General of Silvermoon. Killed and "
            "raised as a banshee by Arthas, she eventually broke free and became the Dark "
            "Lady of the Forsaken. As Warchief of the Horde, she ordered the Burning of "
            "Teldrassil, one of the most devastating acts in Azeroth's history. Her motives "
            "were tied to a pact with the Jailer in the Shadowlands."
        ),
    },
    {
        "topic": "Arthas Menethil (The Lich King)",
        "category": "characters",
        "content": (
            "Arthas Menethil was a paladin prince of Lordaeron who fell to darkness. In his "
            "quest to stop the plague of undeath, he took up the cursed blade Frostmourne, "
            "which consumed his soul. He murdered his father, destroyed Quel'Thalas, and "
            "merged with the Lich King's armor at Icecrown. He was eventually defeated atop "
            "Icecrown Citadel by Tirion Fordring and the champions of Azeroth."
        ),
    },
    {
        "topic": "Thrall (Go'el)",
        "category": "characters",
        "content": (
            "Thrall, born Go'el, is the son of Durotan and Draka. Raised as a slave gladiator "
            "by humans, he escaped, freed the captive Orcs, and led them to Kalimdor. He "
            "founded the new Horde based on honor rather than bloodlust. As a powerful shaman, "
            "he helped save Azeroth during the Cataclysm by wielding the Dragon Soul."
        ),
    },
    {
        "topic": "Cenarius",
        "category": "characters",
        "content": (
            "Cenarius is the Lord of the Forest, a demigod son of Elune and the Wild God "
            "Malorne. He taught Malfurion Stormrage the ways of druidism. Cenarius protects "
            "the forests of Kalimdor and the Emerald Dream. He was killed by the demon-corrupted "
            "Orcs under Grom Hellscream but was later restored to life in the Emerald Dream."
        ),
    },
    {
        "topic": "Jaina Proudmoore",
        "category": "characters",
        "content": (
            "Jaina Proudmoore is one of the most powerful mages on Azeroth. Daughter of "
            "Admiral Daelin Proudmoore, she once sought peace between Alliance and Horde. "
            "The destruction of Theramore by a mana bomb hardened her, turning her into a "
            "formidable war leader. She is the Lord Admiral of Kul Tiras."
        ),
    },
    # ═══════════════════════════════════════════════════════════════
    # LORE EVENTS
    # ═══════════════════════════════════════════════════════════════
    {
        "topic": "War of the Ancients",
        "category": "events",
        "content": (
            "The War of the Ancients occurred over 10,000 years ago when Queen Azshara and "
            "the Highborne Night Elves attempted to summon the dark titan Sargeras into "
            "Azeroth through the Well of Eternity. Malfurion, Tyrande, and Illidan led the "
            "resistance. The war ended with the Sundering — the destruction of the Well of "
            "Eternity, which split the single continent into the continents we know today."
        ),
    },
    {
        "topic": "The Sundering",
        "category": "events",
        "content": (
            "The Sundering was the cataclysmic destruction of the Well of Eternity at the "
            "end of the War of the Ancients. The implosion tore the ancient supercontinent "
            "of Kalimdor apart, creating the Maelstrom at the center of the Great Sea and "
            "reshaping the world into its current form. Millions perished in the devastation."
        ),
    },
    {
        "topic": "Battle of Mount Hyjal",
        "category": "events",
        "content": (
            "The Battle of Mount Hyjal was the climactic battle of the Third War. The Night "
            "Elves, Humans, and Orcs united to defend Nordrassil from the demon lord Archimonde. "
            "Malfurion sacrificed the World Tree's power to destroy Archimonde in a massive "
            "explosion of nature magic. This cost the Night Elves their immortality."
        ),
    },
    {
        "topic": "The Burning of Teldrassil",
        "category": "events",
        "content": (
            "The Burning of Teldrassil was one of the most devastating events in modern "
            "Azeroth history. During the War of Thorns, Warchief Sylvanas Windrunner ordered "
            "the Horde to invade Darkshore and set fire to the World Tree Teldrassil. "
            "Thousands of Night Elf civilians perished in the flames. The event shattered "
            "any remaining trust between Alliance and Horde and drove Tyrande to become "
            "the Night Warrior."
        ),
    },
    {
        "topic": "Fall of the Lich King",
        "category": "events",
        "content": (
            "The Fall of the Lich King was the final confrontation at the top of Icecrown "
            "Citadel. Champions of both Alliance and Horde fought through waves of undead "
            "to reach Arthas. Tirion Fordring shattered Frostmourne with the Ashbringer, "
            "freeing the trapped souls. Bolvar Fordragon then donned the Helm of Domination "
            "to become the new Lich King, a jailer of the dead."
        ),
    },
    # ═══════════════════════════════════════════════════════════════
    # TELDRASSIL SPECIFIC
    # ═══════════════════════════════════════════════════════════════
    {
        "topic": "Teldrassil's Creation",
        "category": "teldrassil",
        "content": (
            "Teldrassil was grown by Archdruid Fandral Staghelm after the Third War, against "
            "the wishes of Malfurion Stormrage who was sleeping in the Emerald Dream. Fandral "
            "planted a new World Tree on an island off Kalimdor's northwest coast, hoping to "
            "restore the Night Elves' lost immortality. However, unlike Nordrassil, Teldrassil "
            "was never blessed by the Dragon Aspects Alexstrasza, Ysera, and Nozdormu."
        ),
    },
    {
        "topic": "Teldrassil's Corruption",
        "category": "teldrassil",
        "content": (
            "Without the Aspects' blessing, Teldrassil was vulnerable to corruption. The "
            "Emerald Nightmare seeped into the tree's roots, and Fandral Staghelm — secretly "
            "working with the Old God-linked Nightmare Lord Xavius — grafted a branch from "
            "the corrupted tree Vordrassil into Teldrassil. This allowed the Nightmare to "
            "spread, corrupting wildlife and tormenting druids sleeping within."
        ),
    },
    {
        "topic": "Shadowglen",
        "category": "teldrassil",
        "content": (
            "Shadowglen is the starting area for Night Elf adventurers, nestled in the "
            "northern part of Teldrassil's canopy. It contains Aldrassil, a smaller tree "
            "where young Night Elves begin their training. The area is home to the trainer "
            "NPCs and early quests involving corrupted wildlife and the first signs of the "
            "Emerald Nightmare's influence."
        ),
    },
    {
        "topic": "Dolanaar",
        "category": "teldrassil",
        "content": (
            "Dolanaar is a small Night Elf village in central Teldrassil. It serves as a "
            "quest hub where adventurers deal with corrupted furbolgs, timberling infestations, "
            "and investigate the spread of the Emerald Nightmare. The village has a moonwell, "
            "an inn, and several trainers."
        ),
    },
    {
        "topic": "Ban'ethil Barrow Den",
        "category": "teldrassil",
        "content": (
            "Ban'ethil Barrow Den is a cave system in Teldrassil where druids sleep in the "
            "Emerald Dream. Many druids have been trapped in unending sleep by the Nightmare's "
            "corruption. Adventurers must enter the den to wake the sleeping druids and "
            "defeat the corrupted creatures within."
        ),
    },
    {
        "topic": "Oracle Glade",
        "category": "teldrassil",
        "content": (
            "Oracle Glade is a sacred area in Teldrassil containing an ancient moonwell "
            "tended by the oracle. The glade is one of the most magically potent locations "
            "on the tree, where the boundary between the physical world and the Emerald "
            "Dream is thin. Druids come here for visions and communion with nature spirits."
        ),
    },
    # ═══════════════════════════════════════════════════════════════
    # GAMEPLAY CONCEPTS
    # ═══════════════════════════════════════════════════════════════
    {
        "topic": "Moonwells",
        "category": "concepts",
        "content": (
            "Moonwells are sacred Night Elf structures filled with water blessed by Elune. "
            "They serve as sources of healing, magical energy, and spiritual power. The "
            "waters of a moonwell can cure corruption, restore health, and provide visions. "
            "Moonwells are found throughout Night Elf territories and are tended by priestesses. "
            "Drinking from a moonwell without permission is considered sacrilege."
        ),
    },
    {
        "topic": "Druids and Druidism",
        "category": "concepts",
        "content": (
            "Druids are practitioners of nature magic who can shapeshift into animal forms "
            "and commune with the spirits of the wild. The first druid was Malfurion Stormrage, "
            "taught by Cenarius himself. Druids can take the forms of bears, cats, moonkin, "
            "and treants. They guard the Emerald Dream and maintain the balance of nature. "
            "The Cenarion Circle is their primary organization."
        ),
    },
    {
        "topic": "Sentinels",
        "category": "concepts",
        "content": (
            "The Sentinels are the primary military force of the Night Elves. Composed almost "
            "entirely of women, they are elite warriors, archers, and scouts who patrol the "
            "forests of Kalimdor. Led by commanders under Tyrande's authority, Sentinels ride "
            "nightsabers and use guerrilla tactics. They are the first line of defense against "
            "any threat to Night Elf lands."
        ),
    },
    {
        "topic": "Wisps",
        "category": "concepts",
        "content": (
            "Wisps are the spirits of deceased Night Elves. Rather than passing on, they "
            "choose to remain as glowing orbs of energy, serving the forests and their living "
            "kin. Wisps can gather resources, detonate to damage enemies, and were famously "
            "used to destroy Archimonde at the Battle of Mount Hyjal. They are a symbol of "
            "the Night Elves' connection to nature even in death."
        ),
    },
    {
        "topic": "Elune (Moon Goddess)",
        "category": "concepts",
        "content": (
            "Elune is the moon goddess worshipped by the Night Elves. She is one of the few "
            "true deities on Azeroth, her power manifesting through moonlight, healing, and "
            "divine wrath. Her priestesses channel her light in the Temple of the Moon. Elune "
            "is the mother of Cenarius and is believed to watch over her children from the "
            "White Lady — the larger of Azeroth's two moons. The Night Warrior is her aspect "
            "of vengeance."
        ),
    },
    {
        "topic": "The Wild Gods",
        "category": "concepts",
        "content": (
            "The Wild Gods are powerful nature spirits who protect Azeroth's wilderness. They "
            "include Cenarius (Lord of the Forest), Malorne (the White Stag, father of Cenarius), "
            "Aviana (goddess of birds), Ursoc and Ursol (twin bear gods), Goldrinn (the wolf "
            "Ancient), and Tortolla (the turtle Ancient). Many fought and fell during the War "
            "of the Ancients but were reborn through the Emerald Dream."
        ),
    },
    {
        "topic": "The Burning Legion",
        "category": "concepts",
        "content": (
            "The Burning Legion is a vast army of demons led by the dark titan Sargeras. "
            "Their goal is the destruction of all life in the universe. They have invaded "
            "Azeroth multiple times — through the War of the Ancients, the opening of the "
            "Dark Portal, and the Third War. The Legion was finally defeated when Sargeras "
            "was imprisoned by the Pantheon of Titans."
        ),
    },
    {
        "topic": "The Old Gods",
        "category": "concepts",
        "content": (
            "The Old Gods are ancient, malevolent entities imprisoned deep beneath Azeroth "
            "by the Titans. They include C'Thun, Yogg-Saron, N'Zoth, and Y'Shaarj. Their "
            "influence corrupts everything it touches — the Emerald Nightmare, the Curse of "
            "Flesh, and the madness of many mortal beings are all their doing. They whisper "
            "to the minds of the weak and dream of breaking free."
        ),
    },
    {
        "topic": "Nordrassil (World Tree)",
        "category": "concepts",
        "content": (
            "Nordrassil, the original World Tree, grows atop Mount Hyjal. It was planted "
            "by the Night Elves after the Sundering over the new Well of Eternity. The "
            "Dragon Aspects — Alexstrasza, Ysera, and Nozdormu — blessed the tree, granting "
            "the Night Elves immortality, a connection to the Emerald Dream, and protection "
            "from disease. It was damaged when used to defeat Archimonde but has since regrown."
        ),
    },
]
