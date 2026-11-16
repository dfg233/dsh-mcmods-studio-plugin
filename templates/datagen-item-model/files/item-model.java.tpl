package {{package}}.datagen;

import net.minecraft.data.PackOutput;
import net.minecraftforge.client.model.generators.ItemModelProvider;
import net.minecraftforge.common.data.ExistingFileHelper;
import {{package}}.{{ClassName}};

/** 物品模型（datagen）。 */
public class ModItemModelsProvider extends ItemModelProvider {
    public ModItemModelsProvider(PackOutput output, ExistingFileHelper existing) {
        super(output, {{ClassName}}.MODID, existing);
    }

    @Override
    protected void registerModels() {
        // 示例：
        // basicItem(ModItems.EXAMPLE.get());
        // handheldItem(ModItems.EXAMPLE_SWORD);
    }
}
