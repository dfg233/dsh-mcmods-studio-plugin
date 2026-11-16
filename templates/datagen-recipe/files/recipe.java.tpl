package {{package}}.datagen;

import net.minecraft.data.PackOutput;
import net.minecraft.data.recipes.FinishedRecipe;
import net.minecraft.data.recipes.RecipeProvider;

import java.util.function.Consumer;

/** 配方（datagen）。 */
public class ModRecipesProvider extends RecipeProvider {
    public ModRecipesProvider(PackOutput output) {
        super(output);
    }

    @Override
    protected void buildRecipes(Consumer<FinishedRecipe> writer) {
        // 示例：
        // ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.EXAMPLE.get())
        //         .pattern("##")
        //         .define('#', Items.IRON_INGOT)
        //         .unlockedBy("has_iron", has(Items.IRON_INGOT))
        //         .save(writer);
    }
}
