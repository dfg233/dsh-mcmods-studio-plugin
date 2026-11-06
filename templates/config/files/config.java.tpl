package {{package}};

import net.minecraftforge.common.ForgeConfigSpec;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.config.ModConfig;

/** {{modid}} 的 Forge 配置。 */
public final class Config {
    private static final ForgeConfigSpec.Builder BUILDER = new ForgeConfigSpec.Builder();

    public static final ForgeConfigSpec.BooleanValue ENABLED =
            BUILDER.comment("是否启用 {{displayName}} 功能").define("enabled", true);

    public static final ForgeConfigSpec SPEC = BUILDER.build();

    private Config() {}

    public static void register() {
        ModLoadingContext.get().registerConfig(ModConfig.Type.COMMON, SPEC);
    }
}
