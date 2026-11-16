package {{package}}.datagen;

import net.minecraft.data.PackOutput;
import net.minecraftforge.client.model.generators.BlockStateProvider;
import net.minecraftforge.common.data.ExistingFileHelper;
import {{package}}.{{ClassName}};

/** 方块状态与方块模型（datagen）。 */
public class ModBlockStateProvider extends BlockStateProvider {
    public ModBlockStateProvider(PackOutput output, ExistingFileHelper existing) {
        super(output, {{ClassName}}.MODID, existing);
    }

    @Override
    protected void registerStatesAndModels() {
        // 示例：
        // simpleBlockWithItem(ModBlocks.EXAMPLE.get(), cubeAll(ModBlocks.EXAMPLE.get()));
        // doorBlockWithRenderType(ModBlocks.EXAMPLE_DOOR.get(), modLoc("block/example_door_bottom"), modLoc("block/example_door_top"), "cutout");
        // trapdoorBlockWithRenderType(ModBlocks.EXAMPLE_TRAPDOOR.get(), modLoc("block/example_trapdoor"), true, "cutout");
        // signBlock((StandingSignBlock) ModBlocks.EXAMPLE_SIGN.get(), (WallSignBlock) ModBlocks.EXAMPLE_WALL_SIGN.get(), blockTexture(ModBlocks.EXAMPLE_PLANKS.get()));
    }
}
