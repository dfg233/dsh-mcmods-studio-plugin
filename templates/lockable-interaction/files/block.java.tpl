package {{package}}.block;

import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** {{displayName}}：可锁交互方块骨架。 */
public class {{ClassName}}Block extends Block {
    public {{ClassName}}Block() {
        super(Properties.of().strength(3.0f));
    }

    @Override
    public InteractionResult use(BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand, BlockHitResult hit) {
        if (level.isClientSide) return InteractionResult.SUCCESS;
        ItemStack held = player.getItemInHand(hand);
        // TODO: 在此实现交互逻辑（检查钥匙、开锁、写回锁状态等）
        return held.isEmpty() ? InteractionResult.PASS : InteractionResult.CONSUME;
    }
}
