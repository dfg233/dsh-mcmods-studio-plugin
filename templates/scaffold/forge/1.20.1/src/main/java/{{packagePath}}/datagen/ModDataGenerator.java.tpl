package {{package}}.datagen;

import net.minecraft.data.DataGenerator;
import net.minecraft.data.PackOutput;
import net.minecraftforge.common.data.ExistingFileHelper;
import net.minecraftforge.data.event.GatherDataEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import {{package}}.{{ClassName}};

/** datagen 入口：providers 放到 datagen/ 后在这里注册。 */
@Mod.EventBusSubscriber(modid = {{ClassName}}.MODID, bus = Mod.EventBusSubscriber.Bus.MOD)
public final class ModDataGenerator {
    @SubscribeEvent
    public static void gatherData(GatherDataEvent event) {
        DataGenerator generator = event.getGenerator();
        PackOutput output = generator.getPackOutput();
        ExistingFileHelper existing = event.getExistingFileHelper();
        // 示例（providers 补齐后启用）：
        // generator.addProvider(event.includeClient(), new ModBlockStateProvider(output, existing));
        // generator.addProvider(event.includeClient(), new ModItemModelsProvider(output, existing));
        // generator.addProvider(event.includeClient(), new ModEnUsLangProvider(output));
        // generator.addProvider(event.includeServer(), new ModRecipesProvider(output));
    }

    private ModDataGenerator() {
    }
}
