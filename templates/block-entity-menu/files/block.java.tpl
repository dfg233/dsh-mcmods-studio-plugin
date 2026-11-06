package {{package}}.block;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** {{displayName}} 的方块。 */
public class {{ClassName}}Block extends Block implements EntityBlock {
    public {{ClassName}}Block() {
        super(Properties.of().strength(3.0f));
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new {{ClassName}}BlockEntity(pos, state);
    }
}
