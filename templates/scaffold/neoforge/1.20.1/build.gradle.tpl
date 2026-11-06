plugins {
    id 'java-library'
    id 'eclipse'
    id 'idea'
    id 'net.neoforged.gradle.userdev' version '7.0.+'
}

version = mod_version
group = mod_group_id

base {
    archivesName = mod_id
}

java.toolchain.languageVersion = JavaLanguageVersion.of(17)

minecraft {
    accessTransformers {
        file('src/main/resources/META-INF/accesstransformer.cfg')
    }
}

runs {
    client {
        systemProperty 'neoforge.enabledGameTestNamespaces', mod_id
    }
    server {
        systemProperty 'neoforge.enabledGameTestNamespaces', mod_id
        programArguments.addAll '--nogui'
    }
}

sourceSets.main.resources { srcDir 'src/generated/resources' }

repositories {
    maven { name = 'NeoForged'; url = 'https://maven.neoforged.net/releases' }
}

dependencies {
    implementation "net.neoforged:neoforge:${neo_version}"
}

tasks.named('processResources', ProcessResources).configure {
    var replaceProperties = [
            minecraft_version: minecraft_version, minecraft_version_range: minecraft_version_range,
            neo_version: neo_version, neo_version_range: neo_version_range,
            loader_version_range: loader_version_range,
            mod_id: mod_id, mod_name: mod_name, mod_license: mod_license, mod_version: mod_version,
            mod_authors: mod_authors, mod_description: mod_description,
    ]
    inputs.properties replaceProperties

    filesMatching(['META-INF/mods.toml', 'pack.mcmeta']) {
        expand replaceProperties + [project: project]
    }
}
