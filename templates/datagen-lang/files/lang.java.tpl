package {{package}}.datagen;

import net.minecraft.data.PackOutput;
import net.minecraftforge.common.data.LanguageProvider;
import {{package}}.{{ClassName}};

/** en_us 语言键（datagen）。 */
public class ModEnUsLangProvider extends LanguageProvider {
    public ModEnUsLangProvider(PackOutput output) {
        super(output, {{ClassName}}.MODID, "en_us");
    }

    @Override
    protected void addTranslations() {
        // 示例：
        // add(ModItems.EXAMPLE.get(), "Example");
        // add(ModBlocks.EXAMPLE.get(), "Example Block");
        add("itemGroup.{{modid}}.main", "{{name}}");
    }
}
