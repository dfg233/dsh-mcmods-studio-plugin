package {{package}}.entity;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.level.Level;

/** {{displayName}}（{{id}}）。 */
public class {{ClassName}} extends Mob {
    public {{ClassName}}(EntityType<? extends {{ClassName}}> type, Level level) {
        super(type, level);
    }
}
