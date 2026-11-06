package {{package}}.block;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import {{package}}.registry.ModBlockEntities;

/** {{displayName}} 的方块实体。 */
public class {{ClassName}}BlockEntity extends BlockEntity {
    public {{ClassName}}BlockEntity(BlockPos pos, BlockState state) {
        super(ModBlockEntities.{{constName}}_BE.get(), pos, state);
    }
}
