package {{package}}.datagen;

import net.minecraft.core.HolderLookup;
import net.minecraft.core.RegistrySetBuilder;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.PackOutput;
import net.minecraftforge.common.data.DatapackBuiltinEntriesProvider;
import net.minecraftforge.registries.ForgeRegistries;
import {{package}}.{{ClassName}};

import java.util.Set;
import java.util.concurrent.CompletableFuture;

/** 世界生成数据（datagen）：Configured/Placed Feature 与 BiomeModifier。 */
public class ModWorldGenProvider extends DatapackBuiltinEntriesProvider {
    public static final RegistrySetBuilder BUILDER = new RegistrySetBuilder()
            .add(Registries.CONFIGURED_FEATURE, context -> { /* ModConfiguredFeatures.bootstrap(context); */ })
            .add(Registries.PLACED_FEATURE, context -> { /* ModPlacedFeatures.bootstrap(context); */ })
            .add(ForgeRegistries.Keys.BIOME_MODIFIERS, context -> { /* ModBiomeModifiers.bootstrap(context); */ });

    public ModWorldGenProvider(PackOutput output, CompletableFuture<HolderLookup.Provider> lookup) {
        super(output, lookup, BUILDER, Set.of({{ClassName}}.MODID));
    }
}
